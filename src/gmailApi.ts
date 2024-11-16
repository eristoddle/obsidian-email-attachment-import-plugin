import { Notice, base64ToArrayBuffer } from 'obsidian';
import { gmail_v1 } from '@googleapis/gmail';
import { processBody, incrementFilename } from 'src/handleMail';
import { GmailSettings } from 'src/settings';
import { authorize } from 'src/googleAuth';
import { assertPresent } from './typeCheck';

export type GMail = gmail_v1.Gmail;
export function createGmailConnect(client: any): GMail {
  return new gmail_v1.Gmail({
    auth: client,
  });
}

const label_options = new Map([
  ['tag', '#{}'],
  ['link', '[[{}]]'],
]);

const body_options = new Map([
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
  const mail_address = res.data.emailAddress;
  return mail_address || '';
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

async function getTemplate(template_path: string) {
  let template = '${Body}';
  if (template_path) {
    template = await this.app.vault.readRaw(template_path);
  }
  const label_match = template.match(/\$\{Labels\|*(.*)\}/) || [];
  const label_format = label_options.get(label_match[1]) || '#{}';
  template = template.replace(/\$\{Labels.*\}/, '${Labels}');
  const body_match = template.match(/\$\{Body\|*(.*)\}/) || [];
  const body_format = body_options.get(body_match[1]) || 'htmlmd';
  template = template.replace(/\$\{Body.*\}/, '${Body}');
  return {
    template: template,
    label_format: label_format,
    body_format: body_format,
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

    const ares = await getAttachment(gmail, account, msgId, attach_id);
    const red = ares.data?.data?.replace(/-/g, '+').replace(/_/g, '/') || '';
    const init_name = filename;
    const final_name = await incrementFilename(init_name, folder);
    await this.app.vault.createBinary(final_name, base64ToArrayBuffer(red));
    files.push(final_name);
  }
  return files;
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

async function saveAttachments(settings: GmailSettings, id: string) {
  const note = await getTemplate(settings.template);
  const noteName_template = settings.noteName;
  const gmail = settings.gc.gmail;
  assertPresent(gmail, 'Gmail is not setup properly');
  const account = settings.mail_account;
  const folder = settings.mail_folder;
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
  console.log('fields:', fields);
  console.log('subject:', fields.get('${Subject}'));

  // const body = await processBody([mailboxObject.raw_mtxt, mailboxObject.raw_mhtml], note.body_format);
  // fields.set('${Body}', body);
  // fields.set('${Link}', `https://mail.google.com/mail/#all/${id}`);
  // const noteName = cleanFilename(renderTemplate(noteName_template, fields));
  // const finalNoteName = await incrementFilename(noteName + `.md`, folder);
  //   assertPresent(payload.headers, 'No headers in payload');
  //   assertPresent(payload.headers[2], 'No headers in payload');

  //   const msgID = payload.headers[2].value;

  //   assertPresent(msgID, 'No msgID in payload');
  //   await makeDirectoryIfAbsent(settings.attachment_folder);
  //   const files = await getAttachments(gmail, account, msgID, mailboxObject.assets, settings.attachment_folder);
  //   fields.set('${Attachment}', files.map((f) => `![[${f}]]`).join('\n'));
  // const content = renderTemplate(note.template, fields);
  // await this.app.vault.create(finalNoteName, content);
}

// TODO: This is where the filtering can happen
async function fetchMailList(account: string, gmail: gmail_v1.Gmail, partialSubjects: string[]) {
  const query = partialSubjects.map(subject => `subject:${subject}`).join(' OR ');
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
  const account = settings.mail_account;
  const base_folder = settings.mail_folder;
  const amount = settings.fetch_amount;
  const gmail = settings.gc.gmail;
  // TODO: Create this setting. Eventually an array of objects with a folder and a list of partial subjects
  // const partialSubjects = settings.partial_subjects;
  const partialSubjects = ['iPad Notebook export'];
  assertPresent(gmail, 'Gmail setup is not correct');

  new Notice('Fetch starting');
  await makeDirectoryIfAbsent(base_folder);
  const threads = (await fetchMailList(account, gmail, partialSubjects)) || [];
  if (threads.length == 0) {
    new Notice(`Your inbox is up to date`);
    return;
  }
  const len = Math.min(threads.length, amount);
  for (let i = 0; i < len; i++) {
    if (i % 5 == 0 && i > 0) new Notice(`${((i / len) * 100).toFixed(0)}% fetched`);
    const id = threads[i].id || '';
    console.log(`Fetching mail with id: ${id}`);
    await saveAttachments(settings, id);
  }
  new Notice(`${len} mails fetched.`);
}
