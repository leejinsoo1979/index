"""INDEX 회의록 AI — WhisperX transcription worker.

Run by server/meetings/server.mjs, one meeting at a time:
  python transcribe.py --audio in.webm --out result.json [--language ko] [--speakers N]

Progress goes to stdout as JSON lines ({"stage": ..., "progress": 0-100}); the transcript is
written to --out. Speaker diarization (pyannote) runs only when HF_TOKEN is set and the
pyannote/speaker-diarization-community-1 terms were accepted on Hugging Face; without it every
line is speaker "SPEAKER_00" and names are assigned in the app.
"""
import argparse
import json
import os
import sys
import time
import warnings

warnings.filterwarnings("ignore")


def emit(stage, progress=None, **extra):
    msg = {"stage": stage, **extra}
    if progress is not None:
        msg["progress"] = round(float(progress), 1)
    print(json.dumps(msg, ensure_ascii=False), flush=True)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--audio", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--language", default="ko")
    p.add_argument("--model", default=os.environ.get("MEETINGS_WHISPER_MODEL", "large-v3-turbo"))
    p.add_argument("--speakers", type=int, default=0, help="exact speaker count, 0 = auto")
    p.add_argument("--threads", type=int, default=max(4, (os.cpu_count() or 8) - 2))
    args = p.parse_args()

    started = time.time()
    emit("loading", 2)
    import torch
    import whisperx

    torch.set_num_threads(args.threads)
    device = "cpu"  # CTranslate2 has no Metal backend; int8 on Apple CPUs is the fast path
    audio = whisperx.load_audio(args.audio)
    duration = len(audio) / 16000.0
    emit("loading", 5, duration=round(duration, 1))

    model = whisperx.load_model(args.model, device, compute_type="int8", language=args.language, threads=args.threads)
    emit("transcribing", 8)
    result = model.transcribe(
        audio,
        batch_size=8,
        language=args.language,
        progress_callback=lambda pct: emit("transcribing", 8 + pct * 0.6),
    )
    del model

    emit("aligning", 70)
    try:
        align_model, meta = whisperx.load_align_model(language_code=args.language, device=device)
        result = whisperx.align(result["segments"], align_model, meta, audio, device, return_char_alignments=False)
        del align_model
    except Exception as e:  # alignment only sharpens timestamps; keep the raw segments
        print(f"align skipped: {e}", file=sys.stderr)

    diarized = False
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    if token:
        emit("diarizing", 80)
        try:
            from whisperx.diarize import DiarizationPipeline

            pipeline = DiarizationPipeline(token=token, device=device)
            kwargs = {"num_speakers": args.speakers} if args.speakers > 0 else {"min_speakers": 1, "max_speakers": 10}
            turns = pipeline(audio, progress_callback=lambda pct: emit("diarizing", 80 + pct * 0.15), **kwargs)
            result = whisperx.assign_word_speakers(turns, result)
            diarized = True
        except Exception as e:
            print(f"diarization skipped: {e}", file=sys.stderr)
            emit("diarizing", 95, warning="화자 분리 모델을 불러오지 못해 화자 구분 없이 저장합니다.")

    segments = []
    for s in result.get("segments", []):
        text = (s.get("text") or "").strip()
        if not text:
            continue
        segments.append({
            "start": round(float(s.get("start") or 0), 2),
            "end": round(float(s.get("end") or 0), 2),
            "speaker": s.get("speaker") or "SPEAKER_00",
            "text": text,
        })

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({
            "language": args.language,
            "model": args.model,
            "duration": round(duration, 1),
            "diarized": diarized,
            "elapsed": round(time.time() - started, 1),
            "segments": segments,
        }, f, ensure_ascii=False)
    emit("done", 100)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        emit("error", message=str(e)[:500])
        sys.exit(1)
