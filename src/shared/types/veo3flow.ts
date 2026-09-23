import type { AspectRatioOption } from './project';

export interface Veo3FlowShotMedia {
  shotId: string;
  order: number;
  heading: string;
  scriptText: string;
  durationSeconds: number;
  estimatedDurationSeconds?: number;
  stillPath: string | null;
  stillTakeId: string | null;
  videoPath: string | null;
  videoTakeId: string | null;
  isApproved: boolean;
}

export interface Veo3FlowProjectData {
  folderPath: string;
  title: string;
  aspectRatio: AspectRatioOption;
  episodeTitle?: string;
  shots: Veo3FlowShotMedia[];
  totalApprovedStills: number;
  totalApprovedVideos: number;
  totalDurationSeconds: number;
}
