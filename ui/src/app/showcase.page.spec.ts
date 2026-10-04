import { ShowcasePage } from './showcase.page';

describe('ShowcasePage', () => {
  it('defaults to autoplaying the first video', () => {
    const page = new ShowcasePage();

    expect(page.autoplayAll()).toBe(true);
    expect(page.selectedVideoIndex()).toBe(0);
    expect(page.selectedVideo().source).toBe('/assets/videos/01-platform-overview.mp4');
  });

  it('lists every recording in filename-prefix order', () => {
    const page = new ShowcasePage();

    expect(page.videos.map((video) => video.sequence)).toEqual(['01', '02', '03', '04', '05']);
    expect(page.videos.map((video) => video.source)).toEqual([
      '/assets/videos/01-platform-overview.mp4',
      '/assets/videos/02. Live Dashboard Walkthrough.mp4',
      '/assets/videos/03. UI Chat Agent - Foundry.mp4',
      '/assets/videos/04. Architecture & Governance.mp4',
      '/assets/videos/05. 12 PySpark ML Insights.mp4',
    ]);
  });

  it('advances to the next recording when autoplay is enabled', () => {
    const page = new ShowcasePage();

    page.playNextVideo();

    expect(page.selectedVideoIndex()).toBe(1);
  });

  it('does not advance when autoplay is disabled', () => {
    const page = new ShowcasePage();
    page.autoplayAll.set(false);

    page.playNextVideo();

    expect(page.selectedVideoIndex()).toBe(0);
  });

  it('enables sound on the active video', () => {
    const page = new ShowcasePage();
    const video = document.createElement('video');
    video.muted = true;
    video.volume = 0;

    page.enableAudio(video);

    expect(page.audioEnabled()).toBe(true);
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(1);
  });
});
