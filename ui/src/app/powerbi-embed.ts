import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import * as pbi from 'powerbi-client';
import type { PowerBiEmbedArtifact } from './tokenomics.model';

/**
 * Embeds a live Power BI report or dashboard built on the Fabric tokenomics
 * OneLake tables, using the signed-in user's Entra ID token (user-owns-data).
 */
@Component({
  selector: 'app-powerbi-embed',
  standalone: true,
  template: `<div #host class="pbi-embed-host"></div>`,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .pbi-embed-host { width: 100%; height: 100%; min-height: 640px; }
    .pbi-embed-host iframe { border: 0; }
  `]
})
export class PowerBiEmbed implements AfterViewInit, OnChanges, OnDestroy {
  @Input() artifact: PowerBiEmbedArtifact | null = null;
  @Input() accessToken: string | null = null;

  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;

  private readonly service = new pbi.service.Service(
    pbi.factories.hpmFactory,
    pbi.factories.wpmpFactory,
    pbi.factories.routerFactory,
  );
  private embedded = false;

  ngAfterViewInit(): void {
    this.tryEmbed();
  }

  ngOnChanges(): void {
    this.tryEmbed();
  }

  private tryEmbed(): void {
    if (!this.host?.nativeElement || !this.artifact || !this.accessToken) return;

    // Reset any prior embed before re-embedding with new inputs.
    this.service.reset(this.host.nativeElement);

    const type = this.artifact.kind === 'dashboard' ? 'dashboard' : 'report';
    const config: pbi.IEmbedConfiguration = {
      type,
      id: this.artifact.id,
      embedUrl: this.artifact.embedUrl,
      accessToken: this.accessToken,
      tokenType: pbi.models.TokenType.Aad,
      permissions: pbi.models.Permissions.Read,
      settings: {
        panes: {
          filters: { visible: true },
          pageNavigation: { visible: true },
        },
        background: pbi.models.BackgroundType.Transparent,
      },
    };

    this.service.embed(this.host.nativeElement, config);
    this.embedded = true;
  }

  ngOnDestroy(): void {
    if (this.embedded && this.host?.nativeElement) {
      this.service.reset(this.host.nativeElement);
    }
  }
}
