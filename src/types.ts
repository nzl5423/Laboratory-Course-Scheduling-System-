/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Student {
  id: string;
  name: string;
  gender: string;
  major: string;
  className: string;
}

export interface Teacher {
  name: string;
}

export type SessionType = '上午' | '下午';

export interface CourseTime {
  startWeek: number;
  endWeek: number;
  weekday: number; // 1-7
  session: SessionType;
  period: string; // e.g. "1-4节"
}

export interface SplitConfig {
  numLabs: number;
  baseCapacity: number;
  columns: number;
  rows: number;
}

export interface LabAssignment {
  labName: string;
  teacherName: string;
  studentRange: {
    startId: string;
    endId: string;
    count: number;
    studentList: Student[];
  };
}

export interface CombinedClassGroup {
  id: string;
  courseName: string;
  classNames: string[];
  totalStudents: number;
  students: Student[];
  invalidClasses: string[];
  splitConfig: SplitConfig;
  time: CourseTime;
  assignments: LabAssignment[];
}

export const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
export const SESSIONS: SessionType[] = ['上午', '下午'];
