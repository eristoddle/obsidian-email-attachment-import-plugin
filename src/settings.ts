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

export interface GmailSettings {
  gc: GoogleService;
  credentials: string;
  mail_folder: string;
  attachment_folder: string;
  template: string;
  token_path: string;
  mail_account: string;
  fetch_amount: number;
  fetch_interval: number;
  fetch_on_load: boolean;
  noteName: string;
}

export const DEFAULT_SETTINGS: GmailSettings = {
  gc: {
    authClient: null,
    gmail: null,
    scope: [],
    login: false,
  },
  credentials: '',
  template: '',
  mail_folder: 'fetchedMail',
  attachment_folder: 'fetchedMail/attachments',
  noteName: '${Subject}',
  token_path: 'plugins/obsidian-google-mail/.token',

  mail_account: '',
  fetch_amount: 25,
  fetch_interval: 0,
  fetch_on_load: false,
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
  removeToken(settings.token_path).then(() => {
    settings.mail_account = '';
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
  const profile_section = new Setting(containerEl)
    .setName('GAP Client JSON')
    .setDesc('The web OAuth client json downloaded from Google Auth Platform.');
  profile_section.addButton((cb) => {
    cb.setButtonText('Setup')
      .setCta()
      .onClick(() => {
        new ExampleModal(this.app, settingTab, (result) => {}).open();
      });
  });
  // TODO: This is not happening. Also need to auth every time I do something. Maybe because dev env?
  // if (await checkToken(settings.token_path)) {
    profile_section.addButton((cb) => {
      cb.setButtonText('logout')
        .setCta()
        .onClick(async () => {
          await logout(settings, settingTab);
        });
    });

    containerEl.createEl('h2', { text: 'Gmail Attachment Import Settings' });
    new Setting(containerEl)
      .setName('Email Account')
      .addText((text) => text.setValue(settings.mail_account).setDisabled(true));
    new Setting(containerEl)
      .setName('Mail Folder')
      .setDesc('Folder to save email attachments')
      .addText((text) =>
        text
          .setPlaceholder('/Folder/')
          .setValue(settings.mail_folder)
          .onChange(async (value) => {
            settings.mail_folder = value;
            await plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName('File Name')
      .setDesc('File name to use for email attachment notes')
      .addText((text) =>
        text
          .setPlaceholder('${Subject}-${Date}')
          .setValue(settings.noteName || '')
          .onChange(async (value) => {
            settings.noteName = value;
            await plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName('Attachement Note Template')
      .setDesc('Template used to render email attachment notes.')
      .addText((text) =>
        text
          .setPlaceholder('/Folder/template.md')
          .setValue(settings.template)
          .onChange(async (value) => {
            settings.template = value;
            await plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName('Fetch Count')
      .setDesc('How many attachments to fetch per action')
      .addText((text) =>
        text
          .setPlaceholder('default is 25')
          .setValue(String(settings.fetch_amount))
          .onChange(async (value) => {
            settings.fetch_amount = parseInt(value);
            await plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName('Fetch Interval')
      .setDesc('Fetch Interval in minutes, 0 disables automatic fetch.')
      .addText((text) =>
        text
          .setPlaceholder('default is 0 disabled')
          .setValue(String(settings.fetch_interval))
          .onChange(async (value) => {
            const parsed = parseInt(value);
            if (isNaN(parsed)) return;
            settings.fetch_interval = parsed > 0 ? parsed : 0;
            await plugin.saveSettings();
            await plugin.setTimer();
          }),
      );
    new Setting(containerEl)
      .setName('Fetch on load')
      .setDesc('Whether to run fetch when Obsidian starts')
      .addToggle((cb) => {
        cb.setValue(settings.fetch_on_load);
        cb.onChange(async (value) => {
          settings.fetch_on_load = value;
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
          if (!(await this.app.vault.exists(settings.template))) {
            new Notice('Template file doesn\'t exist.');
            settings.template = '';
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
