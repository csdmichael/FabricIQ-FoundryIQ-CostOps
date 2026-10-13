import { ShowcasePage } from './showcase.page';
import { ShowcaseConfigService, ShowcaseVideo } from './showcase-config.service';

describe('ShowcasePage', () => {
  const videos: ShowcaseVideo[] = [
    { sequence: '01', title: 'Platform Overview', description: 'Overview', duration: '14:58', source: '/assets/videos/01-platform-overview.mp4' },
    { sequence: '02', title: 'Live Dashboard Walkthrough', description: 'Dashboard', duration: '15:11', source: '/assets/videos/02. Live Dashboard Walkthrough.mp4' },
    { sequence: '03', title: 'UI Chat Agent - Foundry', description: 'Agent', duration: '09:06', source: '/assets/videos/03. UI Chat Agent - Foundry.mp4' },
    { sequence: '04', title: 'Architecture & Governance', description: 'Architecture', duration: '15:57', source: '/assets/videos/04. Architecture & Governance.mp4' },
    { sequence: '05', title: '12 PySpark ML Insights', description: 'Insights', duration: '08:49', source: '/assets/videos/05. 12 PySpark ML Insights.mp4' },
  ];
  const config = { load: vi.fn().mockResolvedValue(videos) } as unknown as ShowcaseConfigService;

  it('loads the configured videos and defaults to autoplaying the first video', async () => {
    const page = new ShowcasePage(config);
    await page.loadVideos();

    expect(page.autoplayAll()).toBe(true);
    expect(page.selectedVideoIndex()).toBe(0);
    expect(page.selectedVideo()?.source).toBe('/assets/videos/01-platform-overview.mp4');
  });

  it('lists every recording in configured order', async () => {
    const page = new ShowcasePage(config);
    await page.loadVideos();

    expect(page.videos().map((video) => video.sequence)).toEqual(['01', '02', '03', '04', '05']);
    expect(page.videos().map((video) => video.source)).toEqual([
      '/assets/videos/01-platform-overview.mp4',
      '/assets/videos/02. Live Dashboard Walkthrough.mp4',
      '/assets/videos/03. UI Chat Agent - Foundry.mp4',
      '/assets/videos/04. Architecture & Governance.mp4',
      '/assets/videos/05. 12 PySpark ML Insights.mp4',
    ]);
  });

  it('advances to the next recording when autoplay is enabled', async () => {
    const page = new ShowcasePage(config);
    await page.loadVideos();

    page.playNextVideo();

    expect(page.selectedVideoIndex()).toBe(1);
  });

  it('does not advance when autoplay is disabled', async () => {
    const page = new ShowcasePage(config);
    await page.loadVideos();
    page.autoplayAll.set(false);

    page.playNextVideo();

    expect(page.selectedVideoIndex()).toBe(0);
  });

  it('enables sound on the active video', () => {
    const page = new ShowcasePage(config);
    const video = document.createElement('video');
    video.muted = true;
    video.volume = 0;

    page.enableAudio(video);

    expect(page.audioEnabled()).toBe(true);
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(1);
  });

  it('describes Azure AI Foundry and Copilot Studio ingestion instead of Azure OpenAI', () => {
    const page = new ShowcasePage(config);
    const copy = JSON.stringify({ features: page.features, layers: page.architectureLayers });

    expect(copy).not.toContain('Azure OpenAI');
    expect(copy).toContain('Azure AI Foundry');
    expect(page.features.find(feature => feature.title === 'Five-cloud ingestion')?.description)
      .toContain('Microsoft Copilot Studio (AI credits converted to USD)');
    expect(page.architectureLayers.find(layer => layer.title === 'Fabric Ingestion')?.items)
      .toContain('Microsoft Copilot Studio (AI credits converted to USD)');
  });

  it('surfaces configuration loading failures', async () => {
    const errorConfig = {
      load: vi.fn().mockRejectedValue(new Error('Invalid showcase configuration.')),
    } as unknown as ShowcaseConfigService;
    const page = new ShowcasePage(errorConfig);

    await page.loadVideos();

    expect(page.videos()).toEqual([]);
    expect(page.videoLoadError()).toBe('Invalid showcase configuration.');
  });
});
