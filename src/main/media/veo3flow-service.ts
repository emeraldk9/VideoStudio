import fs from 'node:fs';
import path from 'node:path';

import type {
  AspectRatioOption,
  ImportedMediaFile,
  Veo3FlowProjectData,
  Veo3FlowShotMedia,
} from '@shared';

import type { SequenceRepository } from '../db/repositories/sequence-repository';
import { Logger } from '../logging/logger';
import { showOpenDialog } from '../windows/native-dialog';

const logger = Logger.createChildLogger('veo3flow-service');

export class Veo3FlowService {
  /**
   * Prompts the user to select a Veo3Flow / Story project folder (e.g. Storage V.1)
   */
  static async pickFolder(): Promise<string | null> {
    const result = await showOpenDialog({
      title: 'Select Veo3Flow / Story Project Folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  }

  /**
   * Parses the project folder and returns verified shot media and captured durations.
   */
  static async parseProjectFolder(folderPath: string): Promise<Veo3FlowProjectData> {
    const normalizedRoot = path.resolve(folderPath);
    const shotsPath = path.join(normalizedRoot, 'shots.json');
    const projectPath = path.join(normalizedRoot, 'project.json');
    const episodesPath = path.join(normalizedRoot, 'episodes.json');

    if (!fs.existsSync(shotsPath)) {
      throw new Error(`Invalid Story folder: "shots.json" not found in ${folderPath}`);
    }

    let projectTitle = path.basename(normalizedRoot);
    let aspectRatio: AspectRatioOption = '16:9';

    if (fs.existsSync(projectPath)) {
      try {
        const rawProj = JSON.parse(await fs.promises.readFile(projectPath, 'utf8'));
        if (rawProj.title) projectTitle = rawProj.title;
        if (rawProj.aspectRatio) aspectRatio = rawProj.aspectRatio as AspectRatioOption;
      } catch (err) {
        logger.warn('Failed to parse project.json', { err });
      }
    }

    let episodeTitle: string | undefined;
    let episodeId: string | undefined;
    if (fs.existsSync(episodesPath)) {
      try {
        const rawEpisodes = JSON.parse(await fs.promises.readFile(episodesPath, 'utf8'));
        if (Array.isArray(rawEpisodes) && rawEpisodes.length > 0) {
          if (rawEpisodes[0].title) episodeTitle = rawEpisodes[0].title;
          if (rawEpisodes[0].id) episodeId = rawEpisodes[0].id;
        }
      } catch (err) {
        logger.warn('Failed to parse episodes.json', { err });
      }
    }

    const rawShotsText = await fs.promises.readFile(shotsPath, 'utf8');
    const rawShots = JSON.parse(rawShotsText);
    if (!Array.isArray(rawShots)) {
      throw new Error(`Invalid shots.json in ${folderPath}: root is not an array.`);
    }

    // Sort by order ascending
    const sortedShots = [...rawShots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const shots: Veo3FlowShotMedia[] = [];

    let totalDurationSeconds = 0;
    let totalApprovedStills = 0;
    let totalApprovedVideos = 0;

    for (let i = 0; i < sortedShots.length; i++) {
      const shot = sortedShots[i];
      const shotId = shot.id || `shot-${i + 1}`;
      const order = typeof shot.order === 'number' ? shot.order : i;
      const heading = shot.heading || `Shot ${order + 1}`;
      const scriptText = shot.scriptText || '';

      const durationSec =
        typeof shot.durationSeconds === 'number' && shot.durationSeconds > 0
          ? shot.durationSeconds
          : typeof shot.estimatedDurationSeconds === 'number' && shot.estimatedDurationSeconds > 0
            ? shot.estimatedDurationSeconds
            : 4.0;

      totalDurationSeconds += durationSec;

      // 1. Resolve Still (Hero Still preferred, then Storyboard Take)
      let stillPath: string | null = null;
      let stillTakeId: string | null = null;
      let isApproved = false;

      const heroTakes: any[] = Array.isArray(shot.heroTakes) ? shot.heroTakes : [];
      const storyboardTakes: any[] = Array.isArray(shot.storyboardTakes) ? shot.storyboardTakes : [];

      let selectedTake: any = null;
      if (shot.selectedHeroTakeId) {
        selectedTake = heroTakes.find((t) => t.takeId === shot.selectedHeroTakeId);
      }
      if (!selectedTake) {
        selectedTake = heroTakes.find((t) => Boolean(t.approvedAt));
      }
      if (!selectedTake && heroTakes.length > 0) {
        selectedTake = heroTakes[heroTakes.length - 1];
      }
      if (!selectedTake && storyboardTakes.length > 0) {
        selectedTake = storyboardTakes.find((t) => Boolean(t.approvedAt)) || storyboardTakes[storyboardTakes.length - 1];
      }

      if (selectedTake && selectedTake.localPath) {
        const fullCandidate = path.resolve(normalizedRoot, selectedTake.localPath);
        if (fs.existsSync(fullCandidate)) {
          stillPath = fullCandidate;
          stillTakeId = selectedTake.takeId || null;
          isApproved = Boolean(selectedTake.approvedAt || shot.selectedHeroTakeId);
          totalApprovedStills++;
        }
      }

      // 2. Resolve Video Take
      let videoPath: string | null = null;
      let videoTakeId: string | null = null;
      const videoTakes: any[] = Array.isArray(shot.videoTakes) ? shot.videoTakes : [];
      const approvedVideo =
        (shot.selectedVideoTakeId ? videoTakes.find((t) => t.takeId === shot.selectedVideoTakeId) : null) ||
        videoTakes.find((t) => Boolean(t.approvedAt)) ||
        videoTakes.find((t) => t.status === 'completed') ||
        (videoTakes.length > 0 ? videoTakes[videoTakes.length - 1] : null);

      if (approvedVideo && approvedVideo.localPath) {
        const fullVideo = path.resolve(normalizedRoot, approvedVideo.localPath);
        if (fs.existsSync(fullVideo)) {
          videoPath = fullVideo;
          videoTakeId = approvedVideo.takeId || null;
          totalApprovedVideos++;
        }
      }

      // Auto-discover video file on disk if not explicitly in metadata
      const epId = shot.episodeId || episodeId;
      if (!videoPath && epId) {
        const shotNum = String(order + 1).padStart(3, '0');
        const candidateDirs = [
          path.resolve(normalizedRoot, 'episodes', epId, 'video', `shot-${shotNum}`),
          path.resolve(normalizedRoot, 'episodes', epId, 'video', shotId),
          path.resolve(normalizedRoot, 'video', `shot-${shotNum}`),
          path.resolve(normalizedRoot, 'video', shotId),
        ];

        for (const cDir of candidateDirs) {
          if (fs.existsSync(cDir)) {
            try {
              const files = fs.readdirSync(cDir).filter((f) => /\.(mp4|mov|webm|mkv)$/i.test(f));
              if (files.length > 0) {
                const bestFile = files.sort().reverse()[0];
                videoPath = path.join(cDir, bestFile);
                videoTakeId = bestFile.replace(/\.[^.]+$/, '');
                totalApprovedVideos++;
                break;
              }
            } catch {
              // ignore directory read error
            }
          }
        }
      }

      shots.push({
        shotId,
        order,
        heading,
        scriptText,
        durationSeconds: Number(durationSec.toFixed(3)),
        estimatedDurationSeconds: shot.estimatedDurationSeconds,
        stillPath,
        stillTakeId,
        videoPath,
        videoTakeId,
        isApproved,
      });
    }

    return {
      folderPath: normalizedRoot,
      title: projectTitle,
      aspectRatio,
      episodeTitle,
      shots,
      totalApprovedStills,
      totalApprovedVideos,
      totalDurationSeconds: Number(totalDurationSeconds.toFixed(3)),
    };
  }

  /**
   * Registers approved media files into VideoStudio SQLite database for the project.
   */
  static async ingestMediaToProject(
    projectData: Veo3FlowProjectData,
    projectId: string,
    sequenceRepo: SequenceRepository,
  ): Promise<ImportedMediaFile[]> {
    const toRecord: {
      path: string;
      kind: 'still' | 'video';
      label: string;
      durationSec: number;
    }[] = [];

    const now = new Date().toISOString();

    for (const shot of projectData.shots) {
      if (shot.stillPath) {
        toRecord.push({
          path: shot.stillPath,
          kind: 'still',
          label: `${String(shot.order + 1).padStart(3, '0')} · ${shot.heading}`,
          durationSec: shot.durationSeconds,
        });
      }
      if (shot.videoPath) {
        toRecord.push({
          path: shot.videoPath,
          kind: 'video',
          label: `${String(shot.order + 1).padStart(3, '0')} · [Video] ${shot.heading}`,
          durationSec: shot.durationSeconds,
        });
      }
    }

    return sequenceRepo.recordMedia(projectId, toRecord, now);
  }
}
