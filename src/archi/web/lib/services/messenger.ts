import { prisma } from '@archi/db';
import { AGENT_LABELS, parseAgentMention } from '@archi/ai';
import { AppError, Capabilities, ErrorCodes } from '@archi/shared';
import { z } from 'zod';
import { requireWorkspaceCapability } from '../authz';
import { writeAuditLog } from '../audit';
import { createTask } from './tasks';

export const createChannelSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1, '채널 이름을 입력해 주세요.').max(100),
});

export const postMessageSchema = z.object({
  text: z.string().min(1, '메시지를 입력해 주세요.').max(4000),
  projectId: z.string().optional(),
});

export async function createChannel(userId: string, input: z.infer<typeof createChannelSchema>) {
  await requireWorkspaceCapability(userId, input.workspaceId, Capabilities.EDIT_DOCUMENTS);
  const channel = await prisma.channel.create({
    data: { workspaceId: input.workspaceId, name: input.name },
  });
  await writeAuditLog({
    actorId: userId,
    action: 'channel.create',
    targetType: 'Channel',
    targetId: channel.id,
    after: { name: channel.name },
  });
  return channel;
}

export async function listChannels(userId: string, workspaceId: string) {
  await requireWorkspaceCapability(userId, workspaceId, Capabilities.VIEW_DOCUMENTS);
  return prisma.channel.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } });
}

export async function listMessages(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '채널을 찾을 수 없습니다.' });
  }
  await requireWorkspaceCapability(userId, channel.workspaceId, Capabilities.VIEW_DOCUMENTS);
  return prisma.channelMessage.findMany({
    where: { channelId },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
}

/**
 * 메시지 전송. @에이전트 mention이 있으면 Task를 생성하고 시스템 메시지로 알린다.
 */
export async function postMessage(
  userId: string,
  channelId: string,
  input: z.infer<typeof postMessageSchema>,
) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '채널을 찾을 수 없습니다.' });
  }
  await requireWorkspaceCapability(userId, channel.workspaceId, Capabilities.EDIT_DOCUMENTS);

  const message = await prisma.channelMessage.create({
    data: { channelId, userId, authorType: 'user', text: input.text },
  });

  const mention = parseAgentMention(input.text);
  let task = null;
  let systemMessage = null;
  if (mention) {
    task = await createTask(userId, {
      workspaceId: channel.workspaceId,
      projectId: input.projectId,
      title: mention.instruction.slice(0, 200),
      description: input.text,
      assigneeAgent: mention.agent,
      requiresReview: true,
      channelMessageId: message.id,
    });
    const agentLabel = AGENT_LABELS[mention.agent] ?? mention.agent;
    systemMessage = await prisma.channelMessage.create({
      data: {
        channelId,
        authorType: 'system',
        text: `${agentLabel}에게 업무가 배정되었습니다: "${task.title}" (Task #${task.id.slice(-6)})`,
      },
    });
  }

  return { message, systemMessage, task };
}
