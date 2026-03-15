interface GlobalTimerData {
  dateCST: string;
  totalSeconds: number;
}

export const globalTimerStorage = {
  async load(dateCST: string): Promise<GlobalTimerData> {
    const params = new URLSearchParams({ date: dateCST });
    const res = await fetch(`/api/global-timer?${params}`);
    return res.json() as Promise<GlobalTimerData>;
  },

  async addSeconds(dateCST: string, seconds: number): Promise<void> {
    await fetch('/api/global-timer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateCST, seconds }),
    });
  },
};
