![Ron Burgundy Question](RonBurgundyQuestion.jpeg)

Downloads email attachments from Gmail based on partial subject matches.

It started as that. Actually it started as a way to get all my ebook highlights and notes into Obisidian where I could use them without going through Readwise. I have a lot of loose ones that I didn't buy through Amazon and those don't seem to work with the Readwise's automatic import from Kindle. Most of my highlights I'd have to email to their email address and then I can pick them up through the Obisidian Readwise extension. So I thought, well I can do that from my own email account.

So I thought, let's make it more universal. Hence, it "downloads email attachments from Gmail based on partial subject matches." I mainly use my iPad's Book App and Kindle App. Well, it turns out the Kindle app does send highlights as attachments but the Book app sends them in the body of the email, so it got more complicated.

So I'm working on doing those specific two things and I'm not sure where "what it does" will end. Maybe, it will "import specific email content from attachment or body" or maybe I will continue in the "get all my notes and citations from everywhere that emails them" direction or if I just bail on messing with regex or anything like that, I just make it an "gmail yourself an Obsidian note plugin". Actually, that last one is looking pretty tempting.

Either way, the original name of the repo is completely wrong now and the description of what it does is up in the air. I knew this would happen when I thought, I'll just whip this thing out in a weekend.

## MVP

This is a work in progress.

It currently finds emails by partial subject and download the attachments or body to a specific folder.

## Some issues with complete Readwise replacement.

- I won't have a book cover unless I use the title and author to search for it.

## TODO

- [x] Convert attachments to markdown
- [x] Make settings value an array of object with a folder and an array of partial subject matches and handle attachment vs body.
- [x] Handle attachment vs body
- [ ] Import configs will have to be more complex
  - [ ] Parsing title, author, and other meta for each
  - [ ] Handle body or attachment HTML cleanup
- [ ] Use custom template to create note
- [ ] Prevent duplicates (possibly storing id in frontmatter and then filter out in search)
- [ ] More metadata to store in frontmatter?
- [ ] Handle archive boolean
- [ ] Improve subject filter method to prevent unexpected imports
- [ ] Clean up project: Put types in folder, consistent name case, refactor, remove dead code, etc.
- [ ] Generate code documentation (Codium?)
- [ ] Create unit tests
- [ ] Upgrade packages and handle dependabot
- [ ] Find more subject matches for ebook use case on different platforms
- [ ] Research and create a default labeled set of these arrays for certain common use cases (like mine)
- [ ] Do more than filtering by subjects (i.e sender, body regex, etc.)
- [ ] Update documentation with setup instructions
- [ ] Figure out what I want it to do more universally and work toward that
- [ ] Create service to serve as the oauth callback (on free [Oracle cloud server](https://www.oracle.com/cloud/free/)?). Currently require pasting in web GAP oauth JSON.
- [ ] Get plugin approved by Obsidian

## Thanks To

[anicholson](https://github.com/anicholson) and the [Obsidian Google Mail](https://github.com/anicholson/obsidian-google-mail) plugin for showing me a way this would work.
