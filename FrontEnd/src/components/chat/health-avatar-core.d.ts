export type HealthAvatarApi = {
  setState: (state: string) => void;
  setSpeaking: (on: boolean) => void;
  setLevel: (v: number) => void;
  dispose: () => void;
  states: string[];
};

export function createHealthAvatar(
  THREE: typeof import("three"),
  canvas: HTMLCanvasElement,
  opts?: { state?: string; interactive?: boolean },
): HealthAvatarApi;
