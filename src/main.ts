import { App, Plugin, PluginSettingTab } from 'obsidian';

import { fetchMailAction } from 'src/gmailApi';
import { draw_settingtab, GmailSettings, DEFAULT_SETTINGS } from 'src/settings';

export default class GmailAttachmentImporter extends Plugin {
  settings: GmailSettings;
  timerID: ReturnType<typeof setInterval>;

  async onload() {
    await this.loadSettings();

    if (this.settings.fetchOnLoad) fetchMailAction(this.settings);

    this.setTimer();

    const ribbonIconEl = this.addRibbonIcon('paperclip', 'Gmail Attachment Import', (evt: MouseEvent) => {
      fetchMailAction(this.settings);
    });

    ribbonIconEl.addClass('GoogleMail-ribbon-class');
    this.addCommand({
      id: 'Gmail-Fetch',
      name: 'Gmail-Fetch',
      callback: () => {
        fetchMailAction(this.settings);
      },
    });

    this.addSettingTab(new GmailAttachmentSettingsTab(this.app, this));
  }

  onunload() {
    this.cancelTimer();
  }

  private async cancelTimer() {
    try {
      clearInterval(this.timerID);
    } catch {
      console.log('Unable to cancel fetch timer id: ' + this.timerID);
    }
  }

  async setTimer() {
    if (isNaN(this.settings.fetchInterval) || this.settings.fetchInterval < 0) {
      return;
    }

    await this.cancelTimer();
    const msInterval = this.settings.fetchInterval * 60000;
    if (msInterval > 0) {
      this.timerID = setInterval(() => {
        fetchMailAction(this.settings);
      }, msInterval);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

export class GmailAttachmentSettingsTab extends PluginSettingTab {
  plugin: GmailAttachmentImporter;

  constructor(app: App, plugin: GmailAttachmentImporter) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    draw_settingtab(this);
  }
}
