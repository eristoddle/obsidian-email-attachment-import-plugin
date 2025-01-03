import { Notice, base64ToArrayBuffer } from 'obsidian';
import { gmail_v1 } from '@googleapis/gmail';
import { processBody, incrementFilename } from 'src/handleMail';
import { GmailSettings, ImportConfig } from 'src/settings';
import { authorize } from 'src/googleAuth';
import { assertPresent } from './typeCheck';
import TurndownService from 'turndown';

export type GMail = gmail_v1.Gmail;

export function createGmailConnect(client: any): GMail {
  return new gmail_v1.Gmail({
    auth: client,
  });
}

const labelOptions = new Map([
  ['tag', '#{}'],
  ['link', '[[{}]]'],
]);

const bodyOptions = new Map([
  ['htmlmd', 'htmlmd'],
  ['text', 'text'],
  ['raw', 'raw'],
]);

export async function fetchMailAction(settings: GmailSettings) {
  if (settings.gc.gmail) {
    await authorize(settings).then(() => {
      fetchMails(settings);
    });
  } else {
    new Notice('You Need to Setup First');
  }
}

export async function getMailAccount(gmail: gmail_v1.Gmail) {
  const res = await gmail.users.getProfile({
    userId: 'me',
  });
  return res.data.emailAddress || '';
}

function renderTemplate(template: string, mail: Map<string, string>) {
  const string = template.replace(/\${\w+}/g, function (all) {
    return mail.get(all) || '';
  });
  return string;
}

function getFields(ary: PayloadHeaders) {
  const m = new Map<string, string>();
  ary
    .filter((item) => item.name && item.value)
    .forEach((item) => {
      assertPresent(item.name, 'No name in payload');
      assertPresent(item.value, 'No value in payload');
      m.set('${' + item.name + '}', item.value);
    });
  return m;
}

function formatDate(iso_date: string) {
  const d = new Date(iso_date);
  return d.toISOString().split('T')[0];
}

async function getTemplate(templatePath: string) {
  let template = '${Body}';
  if (templatePath) {
    template = await this.app.vault.readRaw(templatePath);
  }
  const labelMatch = template.match(/\$\{Labels\|*(.*)\}/) || [];
  const labelFormat = labelOptions.get(labelMatch[1]) || '#{}';
  template = template.replace(/\$\{Labels.*\}/, '${Labels}');
  const bodyMatch = template.match(/\$\{Body\|*(.*)\}/) || [];
  const bodyFormat = bodyOptions.get(bodyMatch[1]) || 'htmlmd';
  template = template.replace(/\$\{Body.*\}/, '${Body}');
  return {
    template: template,
    label_format: labelFormat,
    body_format: bodyFormat,
  };
}

function cleanFilename(filename: string) {
  return filename.replace(/[\\/:"*?<>|]+/g, '_');
}

async function getAttachment(gmail: gmail_v1.Gmail, account: string, message_id: string, attachment_id: string) {
  const res = await gmail.users.messages.attachments.get({
    userId: account,
    messageId: message_id,
    id: attachment_id,
  });
  return res;
}

async function getAttachments(
  gmail: gmail_v1.Gmail,
  account: string,
  msgId: string,
  parts: MessagePart[],
  folder: string,
  config: ImportConfig
) {
  const files = Array<string>();
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const filename = part.filename;
    const attach_id = part.body?.attachmentId;

    if (!filename || !attach_id) {
      console.debug(msgId, `Part ${i} has no filename or attachmentId, skipping...`);
      continue;
    }

    const attachmentResponse = await getAttachment(gmail, account, msgId, attach_id);
    const final_name = await processAttachment(part, folder, attachmentResponse, config);
    files.push(final_name);
  }
  return files;
}

async function processAttachment(part: MessagePart, folder: string, attachmentResponse: any, config: ImportConfig) {
  const base64Data = attachmentResponse.data?.data?.replace(/-/g, '+').replace(/_/g, '/') || '';
  // TODO: This needs to be the book title
  const init_name = part.filename || '';
  const final_name = await incrementFilename(init_name, folder);
  if (part.mimeType === 'text/html') {
    const markdownContent = convertAttachmentToMarkdown(base64Data, config);
    await this.app.vault.create(final_name + '.md', markdownContent);
  } else {
    await this.app.vault.createBinary(final_name, base64ToArrayBuffer(base64Data));
  }
  return final_name;
}

// TODO: 1. Clean up the HTML before converting to markdown (see handleMail.ts) 2. Use template 3. Use one function for both body and attachment
function convertAttachmentToMarkdown(base64Data: string, config: ImportConfig) {
  const decodedHtml = Buffer.from(base64Data, 'base64').toString('utf-8');
  const turndownService = new TurndownService();
  const domParser = new DOMParser();
  const doc = domParser.parseFromString(decodedHtml, 'text/html');

  if (config.removeFromHtml) {
    config.removeFromHtml.forEach((removal) => {
      if (removal.type === 'selector') {
        const elementsToRemove = doc.querySelectorAll(removal.value);
        elementsToRemove.forEach(element => element.remove());
      }
      // TODO: Add raw removal
      // if (removal.type === 'raw') {
      //   const regex = new RegExp(removal.value, 'g');
      //   decodedHtml = decodedHtml.replace(regex, '');
      // }
    });
  }

  const processedHtml = doc.documentElement.outerHTML;
  let markdownContent = turndownService.turndown(processedHtml);

  if (config.addToYaml) {
    let yaml = '---\n';
    config.addToYaml.forEach((addition) => {
      const selector = doc.querySelector(addition.selector);
      if (selector) {
        const value = selector.textContent;
        yaml += `${addition.key}: ${value}\n`;
      }
    });
    yaml += '---\n\n';
    markdownContent = yaml + markdownContent;
  }

  return markdownContent;
}

function flattenParts(mbObj: MailboxObject, parts: MessagePart[]) {
  if (parts.length == 2 && parts[0].mimeType == 'text/plain' && parts[1].mimeType == 'text/html') {
    assertPresent(parts[0].body, 'MessagePart had text/plain MIME type but no body!');
    assertPresent(parts[1].body, 'MessagePart had text/html MIME type but no body!');
    mbObj.raw_mtxt = parts[0].body;
    mbObj.raw_mhtml = parts[1].body;
    for (let i = 2; i < parts.length; i++) {
      mbObj.assets.push(parts[i]);
    }
    return mbObj;
  } else {
    parts.forEach((part) => {
      if (
        part.mimeType == 'multipart/related' ||
        part.mimeType == 'multipart/alternative' ||
        part.mimeType == 'multipart/mixed'
      ) {
        assertPresent(part.parts, 'MessagePart had mixed MIME type but no sub-parts!');
        flattenParts(mbObj, part.parts);
      } else {
        mbObj.assets.push(part);
      }
    });
  }
}

type MailboxObject = {
  assets: Array<MessagePart>;
  raw_mhtml: MessagePartBody | null;
  raw_mtxt: MessagePartBody | null;
  mhtml: string;
  mtxt: string;
};

export type PayloadHeaders = gmail_v1.Schema$MessagePartHeader[];
export type MessagePart = gmail_v1.Schema$MessagePart;
export type MessagePartBody = gmail_v1.Schema$MessagePartBody;

// TODO: Refactor
async function importEmailData(settings: GmailSettings, id: string, config: ImportConfig) {
  const note = await getTemplate(settings.defaultTemplate);
  const noteName_template = settings.defaultNoteName;
  const gmail = settings.gc.gmail;
  assertPresent(gmail, 'Gmail is not setup properly');
  const account = settings.gmailAccount;
  const folder = settings.defaultNoteFolder;
  const res = await gmail.users.threads.get({
    userId: account,
    id: id,
    format: 'full',
  });
  assertPresent(res.data.messages, `No messages in thread with id: ${id}`);
  const title_candidates: PayloadHeaders = (res.data.messages || [])[0].payload?.headers || [];
  const fields = getFields(title_candidates);
  fields.set('${Date}', formatDate(fields.get('${Date}') || ''));

  const payload = res.data.messages.pop()?.payload;
  assertPresent(payload, `No payload in thread with id: ${id}`);
  const mailboxObject: MailboxObject = {
    assets: [],
    raw_mhtml: null,
    raw_mtxt: null,
    mhtml: '',
    mtxt: '',
  };
  const parts: MessagePart[] = payload.parts ? payload.parts : [payload];
  flattenParts(mailboxObject, parts);
  if (!mailboxObject.raw_mhtml && !mailboxObject.raw_mtxt) {
    const htmlAsset = mailboxObject.assets.find(
      (asset) => asset.mimeType == 'text/html' || asset.mimeType == 'text/plain',
    );
    if (htmlAsset && htmlAsset.body) {
      mailboxObject.raw_mhtml = htmlAsset.body;
      mailboxObject.raw_mtxt = htmlAsset.body;
    } else {
      console.warn('no body found');
    }
  }

  // console.log('mailboxObject:');
  // console.log(payload);
  // console.log(mailboxObject);
  // console.log('fields:', fields);
  console.log('subject:', fields.get('${Subject}'));

  assertPresent(payload.headers, 'No headers in payload');
  assertPresent(payload.headers[2], 'No headers in payload');
  const msgID = payload.headers[2].value;
  assertPresent(msgID, 'No msgID in payload');

  if (config.location == 'body') {
    const noteName = cleanFilename(renderTemplate(noteName_template, fields));
    const finalNoteName = await incrementFilename(noteName + `.md`, folder);
    const body = await processBody([mailboxObject.raw_mtxt, mailboxObject.raw_mhtml], note.body_format);
    fields.set('${Body}', body);
    const content = renderTemplate(note.template, fields);
    await this.app.vault.create(finalNoteName, content);
  }

  // TODO: Use template with attachments
  if (config.location == 'attachment') {
    await makeDirectoryIfAbsent(settings.defaultNoteFolder);
    const files = await getAttachments(gmail, account, msgID, mailboxObject.assets, settings.defaultNoteFolder, config);
    fields.set('${Attachment}', files.map((f) => `![[${f}]]`).join('\n'));
  }
}

async function fetchMailList(account: string, gmail: gmail_v1.Gmail, partialSubjects: string[], allowedSenders?: string[]) {
  // TODO: Make query more specific to get exact mail. Currently whitelisting by sender as a bandaid to unexpected imports.
  const subjectQuery = partialSubjects.map((subject) => `subject:"${subject}"`).join(' OR ');
  let query = subjectQuery;
  if (allowedSenders) {
    const senderQuery = allowedSenders.map((sender) => `from:${sender}`).join(' OR ');
    query = `(${subjectQuery}) AND (${senderQuery})`;
  }
  const res = await gmail.users.threads.list({
    userId: account,
    maxResults: 100,
    q: query,
  });
  return res.data.threads;
}

async function makeDirectoryIfAbsent(path: string) {
  const isExist = await this.app.vault.exists(path);
  if (!isExist) {
    this.app.vault.createFolder(path);
  }
}

async function fetchMails(settings: GmailSettings) {
  const account = settings.gmailAccount;
  const base_folder = settings.defaultNoteFolder;
  const amount = settings.fetchAmount;
  const gmail = settings.gc.gmail;
  assertPresent(gmail, 'Gmail is not setup properly');
  const importConfigs = settings.importConfigs;

  new Notice('Fetch starting');
  await makeDirectoryIfAbsent(base_folder);
  let totalLen = 0;
  importConfigs.forEach(async (config) => {
    const threads = (await fetchMailList(account, gmail, config.partialSubjects, config.filterBySenders)) || [];
    if (threads.length == 0) {
      new Notice(`No mails found for: ${config.label}`);
      return;
    }
    const len = Math.min(threads.length, amount);
    totalLen += len;
    for (let i = 0; i < len; i++) {
      if (i % 5 == 0 && i > 0) new Notice(`${((i / len) * 100).toFixed(0)}% fetched`);
      const id = threads[i].id || '';
      console.log(`Fetching mail with id: ${id}`);
      await importEmailData(settings, id, config);
    }
  });
  new Notice(`${totalLen} mails fetched.`);
}
