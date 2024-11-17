import { Client, setupGserviceConnection } from 'src/googleAuth';
import { checkToken, removeToken } from 'src/googleAuth';
import { Setting, Modal, Notice, App } from 'obsidian';
import { GmailAttachmentSettingsTab } from 'src/main';
import { GMail } from './gmailApi';

interface GoogleService {
  authClient: Client | null;
  gmail: GMail | null;
  scope: Array<string>;
  login: boolean;
}

export interface ImportConfig {
  label: string;
  format: 'html' | 'text';
  partialSubjects: string[];
  location: 'attachment' | 'body';
  active: boolean;
  filterBySenders?: string[];
  // TODO: Handle these
  noteName?: string;
  template?: string;
  folder?: string;
  archive?: boolean;
}

export interface GmailSettings {
  gc: GoogleService;
  credentials: string;
  defaultNoteFolder: string;
  defaultTemplate: string;
  tokenPath: string;
  gmailAccount: string;
  fetchAmount: number;
  fetchInterval: number;
  fetchOnLoad: boolean;
  defaultNoteName: string;
  importConfigs: Array<ImportConfig>;
}

export const DEFAULT_SETTINGS: GmailSettings = {
  gc: {
    authClient: null,
    gmail: null,
    scope: [],
    login: false,
  },
  credentials: '',
  defaultTemplate: '',
  defaultNoteFolder: 'gmailNotes',
  defaultNoteName: '${Subject}',
  tokenPath: 'plugins/obsidian-google-mail/.token',

  gmailAccount: '',
  fetchAmount: 25,
  fetchInterval: 0,
  fetchOnLoad: false,
  // TODO: Remove my hardcoded values. Add this to settings UI. Will also need to handle html cleanup and title and author extraction.
  importConfigs: [
    {
      label: 'Kindle Highlights',
      format: 'html',
      partialSubjects: ['iPad Notebook export'],
      filterBySenders: ['stephanmil@gmail.com'],
      location: 'attachment',
      active: true,
    },
    {
      label: 'Books App Highlights',
      format: 'html',
      partialSubjects: ['Notes from'],
      filterBySenders: ['stephanmil@gmail.com'],
      location: 'body',
      active: true,
    },
  ],
};

export class ExampleModal extends Modal {
  result: string;
  settings: GmailSettings;
  settingTab: GmailAttachmentSettingsTab;
  onSubmit: (result: string) => void;
  constructor(app: App, settingTab: GmailAttachmentSettingsTab, onSubmit: (result: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
    this.settingTab = settingTab;
    this.settings = settingTab.plugin.settings;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl('h1', { text: 'Paste Credential Content' });
    this.result = this.settings.credentials;
    new Setting(contentEl).setName('Credential Content').addText((text) =>
      text.setValue(this.settings.credentials).onChange(async (value) => {
        this.result = value;
        this.settings.credentials = value;
        await this.settingTab.plugin.saveSettings();
      }),
    );
    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText('Submit')
        .setCta()
        .onClick(() => {
          this.close();
          this.onSubmit(this.result);
        }),
    );
  }

  async onClose() {
    const { contentEl } = this;
    contentEl.empty();
    if (this.result) {
      if (await setupGserviceConnection(this.settings)) {
        new Notice('Successful Login');
        await this.settingTab.plugin.saveSettings();
        this.settingTab.display();
      } else {
        await logout(this.settings, this.settingTab);
      }
    } else new Notice('No credentials received');
  }
}

async function logout(settings: GmailSettings, Tab: GmailAttachmentSettingsTab) {
  removeToken(settings.tokenPath).then(() => {
    settings.gmailAccount = '';
    settings.gc.gmail = null;
    settings.gc.login = false;
    settings.gc.authClient = null;
    Tab.plugin.saveSettings();
    Tab.display();
  });
}

export async function draw_settingtab(settingTab: GmailAttachmentSettingsTab) {
  const plugin = settingTab.plugin;
  const { containerEl } = settingTab;
  const settings = plugin.settings;
  containerEl.empty();
  containerEl.createEl('h2', { text: 'Setup Google OAuth' });
  const profileSection = new Setting(containerEl)
    .setName('GAP Client JSON')
    .setDesc('The web OAuth client json downloaded from Google Auth Platform.');
  profileSection.addButton((cb) => {
    cb.setButtonText('Setup')
      .setCta()
      .onClick(() => {
        new ExampleModal(this.app, settingTab, (result) => {}).open();
      });
  });
  // TODO: This is not happening. Also need to auth every time I do something. Maybe because dev env?
  // if (await checkToken(settings.token_path)) {
    profileSection.addButton((cb) => {
      cb.setButtonText('logout')
        .setCta()
        .onClick(async () => {
          await logout(settings, settingTab);
        });
    });

    containerEl.createEl('h2', { text: 'Gmail Import Settings' });
    new Setting(containerEl)
      .setName('Email Account')
      .addText((text) => text.setValue(settings.gmailAccount).setDisabled(true));
    new Setting(containerEl)
      .setName('Mail Folder')
      .setDesc('Default folder to save email exports')
      .addText((text) =>
        text
          .setPlaceholder('/Folder/')
          .setValue(settings.defaultNoteFolder)
          .onChange(async (value) => {
            settings.defaultNoteFolder = value;
            await plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName('File Name')
      .setDesc('Default file name to use for notes')
      .addText((text) =>
        text
          .setPlaceholder('${Subject}-${Date}')
          .setValue(settings.defaultNoteName || '')
          .onChange(async (value) => {
            settings.defaultNoteName = value;
            await plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName('Attachment Template')
      .setDesc('Default template used to render notes.')
      .addText((text) =>
        text
          .setPlaceholder('/Folder/template.md')
          .setValue(settings.defaultTemplate)
          .onChange(async (value) => {
            settings.defaultTemplate = value;
            await plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName('Fetch Count')
      .setDesc('How many emails to fetch per action')
      .addText((text) =>
        text
          .setPlaceholder('default is 25')
          .setValue(String(settings.fetchAmount))
          .onChange(async (value) => {
            settings.fetchAmount = parseInt(value);
            await plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName('Fetch Interval')
      .setDesc('Fetch Interval in minutes, 0 disables automatic fetch.')
      .addText((text) =>
        text
          .setPlaceholder('default is 0 disabled')
          .setValue(String(settings.fetchInterval))
          .onChange(async (value) => {
            const parsed = parseInt(value);
            if (isNaN(parsed)) return;
            settings.fetchInterval = parsed > 0 ? parsed : 0;
            await plugin.saveSettings();
            await plugin.setTimer();
          }),
      );
    new Setting(containerEl)
      .setName('Fetch on load')
      .setDesc('Whether to run fetch when Obsidian starts')
      .addToggle((cb) => {
        cb.setValue(settings.fetchOnLoad);
        cb.onChange(async (value) => {
          settings.fetchOnLoad = value;
          await plugin.saveSettings();
        });
      });
    new Setting(containerEl)
      .setName('Validation')
      .setDesc('Validates your settings.')
      .addButton((cb) => {
        cb.setCta();
        cb.setIcon('checkmark');
        cb.onClick(async (cb) => {
          let checked = true;
          if (!(await this.app.vault.exists(settings.defaultTemplate))) {
            new Notice('Template file doesn\'t exist.');
            settings.defaultTemplate = '';
            checked = false;
          }
          if (checked) {
            new Notice('All Clear!');
          }
          await plugin.saveSettings();
          settingTab.display();
        });
      });
  // }
}
