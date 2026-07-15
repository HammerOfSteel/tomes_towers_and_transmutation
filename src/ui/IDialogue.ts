/** Minimal interface shared by DialogueOverlay and FloatingDialogue3D. */
export interface IDialogue {
  speak(text: string, speaker?: string): Promise<void>;
  choose(choices: string[]): Promise<number>;
  showStatGain(label: string): void;
}
