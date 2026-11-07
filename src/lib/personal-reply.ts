/** Stored evidence stays on the server; old and new messages show conversational text. */
export function personalReplyText(content:string){
  return content
    .replace(/\[(?:\d+(?:\s*[,，–-]\s*\d+)*)\]/g,'')
    .replace(/\[([^\]]+)\]\(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^)]+\)/g,'')
    .replace(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/\S+/g,'')
    .replace(/^[ \t]*(?:출처|참고\s*(?:자료|영상)|근거\s*자료)\s*:[^\n]*(?:\n|$)/gm,'')
    .replace(/[ \t]+([,.!?])/g,'$1').replace(/\n{3,}/g,'\n\n').trim();
}
