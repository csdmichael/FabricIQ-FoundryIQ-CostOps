import { ShowcasePage } from './showcase.page';

describe('ShowcasePage', () => {
  it('defaults to autoplaying the first video', () => {
    const page = new ShowcasePage();

    expect(page.autoplayAll()).toBe(true);
    expect(page.selectedVideoIndex()).toBe(0);
    expect(page.selectedVideo().source).toBe('/assets/videos/01-platform-overview.mp4');
  });

  it('advances to the next available recording when autoplay is enabled', () => {
    const page = new ShowcasePage();
    page.videos[2].source = '/assets/videos/03-ml-insights.mp4';

    page.playNextVideo();

    expect(page.selectedVideoIndex()).toBe(2);
  });

  it('does not advance when autoplay is disabled', () => {
    const page = new ShowcasePage();
    page.videos[1].source = '/assets/videos/02-dashboard.mp4';
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
