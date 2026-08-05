export interface TeacherProfile {
  teacherId: string;
  teacherName: string;
  schoolName: string;
  principalName: string;
  stage: string;
  grade: string;
  subject: string;
  semester: string;
  academicYear: string;
}

export interface MadrasatiProvider {
  connect(): Promise<boolean>;
  getProfile(): Promise<TeacherProfile>;
}

export class MadrasatiEngine {
  constructor(
    private readonly provider: MadrasatiProvider,
  ) {}

  async syncProfile(): Promise<TeacherProfile> {
    await this.provider.connect();
    return this.provider.getProfile();
  }
}
