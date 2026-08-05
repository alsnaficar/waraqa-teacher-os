export interface TeamsMeeting {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  joinUrl: string;
}

export interface TeamsProvider {
  createMeeting(title: string, startTime: Date, endTime: Date): Promise<TeamsMeeting>;
}

export class TeamsEngine {
  constructor(private readonly provider: TeamsProvider) {}

  async createLessonMeeting(title: string, startTime: Date, endTime: Date) {
    return this.provider.createMeeting(title, startTime, endTime);
  }
}
