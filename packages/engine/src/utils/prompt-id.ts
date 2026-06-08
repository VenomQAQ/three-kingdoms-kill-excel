let seq = 0;

export function nextPromptId(): string {
  seq += 1;
  return `prompt_${seq}`;
}
