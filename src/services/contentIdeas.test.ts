import { describe, expect, it } from 'vitest';
import type { ContentIdea, PlanItem } from '../types/trip';
import {
  canManageContentIdea,
  detectContentPlatform,
  extractAutoThumbnail,
  formatPlatformLabel,
  mergePlanEntries,
  normalizeReferenceUrl,
} from './contentIdeas';

describe('Content Ideas platform detection, thumbnails & Plan rundown merge', () => {
  it('detects social platforms and normalizes scheme-less reference URLs', () => {
    expect(normalizeReferenceUrl('  instagram.com/reel/DdORP-iJO_6/ ')).toBe(
      'https://instagram.com/reel/DdORP-iJO_6/',
    );
    expect(normalizeReferenceUrl('')).toBe('');

    const igReel = detectContentPlatform(
      'https://www.instagram.com/reel/DdORP-iJO_6/?dmpr=bXVxejdqd2drZzAz',
    );
    expect(igReel.platform).toBe('instagram');
    expect(formatPlatformLabel(igReel.platform, igReel.normalizedUrl)).toBe('IG Reels');

    const igPost = detectContentPlatform(
      'https://www.instagram.com/p/DfmszX0mryJ/?img_index=4',
    );
    expect(igPost.platform).toBe('instagram');
    expect(formatPlatformLabel(igPost.platform, igPost.normalizedUrl)).toBe('Instagram');

    const tiktok = detectContentPlatform('vm.tiktok.com/ZS2abc123/');
    expect(tiktok.platform).toBe('tiktok');
    expect(tiktok.normalizedUrl).toBe('https://vm.tiktok.com/ZS2abc123/');
    expect(formatPlatformLabel(tiktok.platform, tiktok.normalizedUrl)).toBe('TikTok');

    const yt = detectContentPlatform('https://youtube.com/shorts/dQw4w9WgXcQ');
    expect(yt.platform).toBe('youtube');
    expect(formatPlatformLabel(yt.platform, yt.normalizedUrl)).toBe('YT Shorts');

    const pin = detectContentPlatform('https://pin.it/abc123');
    expect(pin.platform).toBe('pinterest');
    expect(formatPlatformLabel(pin.platform)).toBe('Pinterest');

    const web = detectContentPlatform('https://example.com/shots');
    expect(web.platform).toBe('web');
    expect(formatPlatformLabel(web.platform)).toBe('Link');
  });

  it('auto-extracts YouTube & YouTube Shorts thumbnails cleanly', () => {
    expect(extractAutoThumbnail('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
    expect(extractAutoThumbnail('https://youtube.com/shorts/aBcDeFgHiJk?feature=share')).toBe(
      'https://i.ytimg.com/vi/aBcDeFgHiJk/hqdefault.jpg',
    );
    expect(extractAutoThumbnail('https://youtu.be/1234567890_')).toBe(
      'https://i.ytimg.com/vi/1234567890_/hqdefault.jpg',
    );
    expect(
      extractAutoThumbnail('https://www.instagram.com/reel/DdORP-iJO_6/'),
    ).toBeUndefined();
  });

  it('merges itinerary stops and showInPlan ContentIdeas in chronological order with timeless ideas last', () => {
    const stops: PlanItem[] = [
      {
        id: 'it-7',
        dayId: 'day-3',
        type: 'place',
        title: 'Goa Maria Ganjuran',
        startTime: '08:30',
        locationHint: 'Bantul',
        address: 'Bantul',
        status: 'active',
        notes: [],
      },
      {
        id: 'it-7b',
        dayId: 'day-3',
        type: 'place',
        title: 'Pantai Parangkusumo',
        startTime: '10:15',
        locationHint: 'Kretek',
        address: 'Kretek',
        status: 'upcoming',
        notes: [],
      },
    ];

    const ideas: ContentIdea[] = [
      {
        id: 'idea-convoy',
        title: 'Convoy Rolling Transition',
        referenceUrl: 'https://www.instagram.com/reel/Dd8nUoJAtF2/',
        platform: 'instagram',
        status: 'to-shoot',
        showInPlan: true,
        dayId: 'day-3',
        time: '09:45',
        createdBy: 'm-kris',
        createdAt: '2026-11-22T09:00:00Z',
      },
      {
        id: 'idea-anytime',
        title: 'Sunset Silhouette Clip',
        referenceUrl: 'https://www.instagram.com/reel/abc/',
        platform: 'instagram',
        status: 'to-shoot',
        showInPlan: true,
        dayId: 'day-3',
        createdBy: 'm-rani',
        createdAt: '2026-11-22T09:05:00Z',
      },
      {
        id: 'idea-hidden',
        title: 'Group Pose Inspiration',
        referenceUrl: 'https://www.instagram.com/p/DfmszX0mryJ/',
        platform: 'instagram',
        status: 'to-shoot',
        showInPlan: false,
        dayId: 'day-3',
        time: '09:00',
        createdBy: 'm-kris',
        createdAt: '2026-11-22T09:10:00Z',
      },
    ];

    const mergedAll = mergePlanEntries(stops, ideas, 'day-3', 'all');
    expect(mergedAll.map((e) => e.id)).toEqual([
      'it-7',
      'idea-convoy',
      'it-7b',
      'idea-anytime',
    ]);

    const contentOnly = mergePlanEntries(stops, ideas, 'day-3', 'content');
    expect(contentOnly.map((e) => e.id)).toEqual(['idea-convoy', 'idea-anytime']);

    const placesOnly = mergePlanEntries(stops, ideas, 'day-3', 'place');
    expect(placesOnly.map((e) => e.id)).toEqual(['it-7', 'it-7b']);
  });

  it('enforces creator or Host/Editor edit rights for existing content ideas while letting all crew add', () => {
    const idea: ContentIdea = {
      id: 'idea-1',
      title: 'POV Shot',
      referenceUrl: 'https://www.instagram.com/reel/DdORP-iJO_6/',
      platform: 'instagram',
      status: 'to-shoot',
      showInPlan: false,
      createdBy: 'm-rani',
      createdAt: '2026-11-22T09:00:00Z',
    };

    expect(canManageContentIdea(null, 'm-dora', false)).toBe(true);
    expect(canManageContentIdea(idea, 'm-rani', false)).toBe(true);
    expect(canManageContentIdea(idea, 'm-dora', false)).toBe(false);
    expect(canManageContentIdea(idea, 'm-kris', true)).toBe(true);
  });
});
