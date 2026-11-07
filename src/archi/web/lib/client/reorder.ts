/** 배열에서 index의 항목을 위/아래로 한 칸 이동한 새 배열 반환 */
export function moveItem<T>(items: readonly T[], index: number, direction: 'up' | 'down'): T[] {
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }
  const next = [...items];
  const a = next[index] as T;
  const b = next[target] as T;
  next[index] = b;
  next[target] = a;
  return next;
}
