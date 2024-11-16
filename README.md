# Obsidian Gmail Attachment Import Plugin

Downloads email attachments from Gmail based on partial subject matches. Currently I am using this to export iPad notebook exports for ebook highlights. But I can see it being used for a variety of attachments. But for now it replaces my main use case for Readwise, which does the same thing but through their own email service.

## MVP

Find emails by partial subject and download the attachments to specific folder.

## TODO

- [x] Convert attachments to markdown
- [ ] Clean up HTML before convert
- [ ] Use custom template to create note
- [ ] Prevent duplicates
- [ ] Do something with the original gmails, like archive
- [ ] Generate code documentation (Codium?)
- [ ] Create unit tests
- [ ] Upgrade packages and handle dependabot
- [ ] Find more subject matches for ebook use case on different platforms
- [ ] Make settings value an array of object with a folder and an array of partial subject matches
- [ ] Research and create a default labeled set of these arrays for certain common use cases (like mine)
- [ ] Do more than filtering by subjects (i.e sender, body regex, etc.)
- [ ] Update documentation with setup instructions
- [ ] Create service to serve as the oauth callback (on free [Oracle cloud server](https://www.oracle.com/cloud/free/)?). Currently require pasting in web GAP oauth JSON.
- [ ] Get plugin approved by Obsidian
- [ ] Add support for multiple email accounts

## Support Plugin Development

<a href="https://www.buymeacoffee.com/eristoddle" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>
