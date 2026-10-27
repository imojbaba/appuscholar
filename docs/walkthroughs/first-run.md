# First run: the walk

Five paths through the first-run flow (PR "First run: the idea screen first, Connect AI when AI is first needed"), each screen as a stranger meets it.

For each screen: what it is, whether I must do it now, and where it lives later.

- **Screenshots:** taken from a local dev build, so the round "N" in the corner is Next.js's dev badge. Their files are in `screens/first-run/`.
- **The AI:** answered by a stand-in in the browser.
- **The key:** a made-up test value.
- **Public data:** the recovery code shown belongs to a throwaway local account. No account, email or real key appears.

### 1. Has a key

Idea, Get feedback, Yes I have a key, paste, Connect, Remember on this computer, then the feedback runs and the project is saved.

| Screen | Desktop (1280 px) | Phone (375 px) |
| --- | --- | --- |
| **The idea screen, the first screen after the terms.**<br><br>**What is it?** "What do you want to study?" with one box. Field of study sits under it (Change), and the three questions are folded away as optional. **Must I do it now?** Only the idea: nothing opens over the page. The one primary button is Get feedback on my idea; "Save without feedback" is the quiet alternative. **Later?** The note says I can save now and get feedback later in my project. | <img src="screens/first-run/1-has-a-key-desktop-01-idea-screen.jpg" width="420"> | <img src="screens/first-run/1-has-a-key-phone-01-idea-screen.jpg" width="190"> |
| **4a: Connect AI, opened by Get feedback with no key.**<br><br>**What is it?** The title says why ("Connect AI to get feedback"), and the text says what a key is and that Google gives one free. **Must I do it now?** No: "Save my idea without feedback" and the cross both go on without it, and the idea stays typed. **Later?** "You can do this later: press Connect AI at the top of the page (in Menu on a phone)." That is the header label word for word. | <img src="screens/first-run/1-has-a-key-desktop-02-connect-question.jpg" width="420"> | <img src="screens/first-run/1-has-a-key-phone-02-connect-question.jpg" width="190"> |
| **4c: paste the key.**<br><br>**What is it?** One key box with Show, "From Google Gemini.", and a link for another AI company. **Must I do it now?** No: Back, the cross, and the "later" line. **Next step:** Connect, which tests the key at once ("Checking your key…"). A refusal is said here in plain words, with Try again and Save my idea without feedback. | <img src="screens/first-run/1-has-a-key-desktop-03-paste-key.jpg" width="420"> | <img src="screens/first-run/1-has-a-key-phone-03-paste-key.jpg" width="190"> |
| **4d: how should we keep it?**<br><br>**What is it?** Two choices with what each means: Remember on this computer (easiest) and Protect with a passphrase (most private). **Must I do it now?** It is the last question before the key is saved; the screen says closing saves nothing, and a toast repeats "Your key was not saved." **Later?** "You can change this later in AI connection, in the account menu." | <img src="screens/first-run/1-has-a-key-desktop-04-keep.jpg" width="420"> | <img src="screens/first-run/1-has-a-key-phone-04-keep.jpg" width="190"> |
| **4e: the feedback, run with no second press.**<br><br>"AI connected." is shown, and the read appears beside the idea. Under it are the project name (filled from the idea) and **Save as my project**, the one primary button. On a phone the page scrolls to the read. The feedback button turns quiet ("Get feedback again"). | <img src="screens/first-run/1-has-a-key-desktop-05-feedback.jpg" width="420"> | <img src="screens/first-run/1-has-a-key-phone-05-feedback.jpg" width="190"> |
| **The project's home, just made.**<br><br>**What is it?** "Your project is ready": what was saved, then "What's at the top of the page" (AI; 🔒 Locked / 🔓 Unlocked only when a passphrase exists; Account: settings, export, help and sign out), then Got it. **Must I do it now?** No; the suggested next step and the six stages are below. | <img src="screens/first-run/1-has-a-key-desktop-06-home.jpg" width="420"> | <img src="screens/first-run/1-has-a-key-phone-06-home.jpg" width="190"> |

### 2. No key, and gets one

No, help me get a free one, then I have my key, paste, Connect, Remember, feedback, save.

| Screen | Desktop (1280 px) | Phone (375 px) |
| --- | --- | --- |
| **4a: Connect AI**: as in path 1. | <img src="screens/first-run/2-no-key-gets-one-desktop-02-connect-question.jpg" width="420"> | <img src="screens/first-run/2-no-key-gets-one-phone-02-connect-question.jpg" width="190"> |
| **4b: get a free key from Google.**<br><br>**What is it?** Five numbered steps and an Open Google AI Studio button (new tab). The free-key note repeats terms d3. **Must I do it now?** No: Back, the cross, and the same "later" line. **Next step:** I have my key (the one primary button). | <img src="screens/first-run/2-no-key-gets-one-desktop-03-get-a-free-key.jpg" width="420"> | <img src="screens/first-run/2-no-key-gets-one-phone-03-get-a-free-key.jpg" width="190"> |
| **4c: paste the key**: as in path 1. | <img src="screens/first-run/2-no-key-gets-one-desktop-04-paste-key.jpg" width="420"> | <img src="screens/first-run/2-no-key-gets-one-phone-04-paste-key.jpg" width="190"> |
| **4d: how should we keep it?**: as in path 1. | <img src="screens/first-run/2-no-key-gets-one-desktop-05-keep.jpg" width="420"> | <img src="screens/first-run/2-no-key-gets-one-phone-05-keep.jpg" width="190"> |
| **4e: the feedback, then the home**: as in path 1. | <img src="screens/first-run/2-no-key-gets-one-desktop-06-feedback.jpg" width="420"> | <img src="screens/first-run/2-no-key-gets-one-phone-06-feedback.jpg" width="190"> |

### 3. Skips AI

Save my idea without feedback at 4a: the project is made with no read, and the home shows the quiet AI line.

| Screen | Desktop (1280 px) | Phone (375 px) |
| --- | --- | --- |
| **4a: Connect AI**, choosing **Save my idea without feedback**. | <img src="screens/first-run/3-skips-ai-desktop-02-connect-question.jpg" width="420"> | <img src="screens/first-run/3-skips-ai-phone-02-connect-question.jpg" width="190"> |
| **The home after "Save my idea without feedback".**<br><br>The ready card says the question and a blank document were saved; no lock line, because there is no passphrase. | <img src="screens/first-run/3-skips-ai-desktop-03-home-no-ai.jpg" width="420"> | <img src="screens/first-run/3-skips-ai-phone-03-home-no-ai.jpg" width="190"> |
| **The home with no key, after Got it.**<br><br>**What is it?** One quiet line: "AI isn't connected. Connect it when you want feedback or writing help.", with Connect AI. **Must I do it now?** No; it is not a banner. **Later?** The same label is at the top of the page. The line goes once a key works. | <img src="screens/first-run/3-skips-ai-desktop-04-home-ai-line.jpg" width="420"> | <img src="screens/first-run/3-skips-ai-phone-04-home-ai-line.jpg" width="190"> |

### 4. Chooses a passphrase

4d's Protect with a passphrase: set and confirm in the same window, the recovery sheet, then the feedback.

| Screen | Desktop (1280 px) | Phone (375 px) |
| --- | --- | --- |
| **4d, second choice: the passphrase, typed twice.**<br><br>**What is it?** What a passphrase does, two fields with Show, and two live rules: at least 10 characters, both match. The button stays off until both are ticked. **Must I do it now?** No: Back returns to the two choices. **Later?** The account menu has Lock my work with a passphrase while no passphrase is set. | <img src="screens/first-run/4-passphrase-desktop-04-passphrase-checks.jpg" width="420"> | <img src="screens/first-run/4-passphrase-phone-04-passphrase-checks.jpg" width="190"> |
| **Both rules ticked.**<br><br>Lock my work is on. A failed setup (offline) is said under the fields, in the window (#37). | <img src="screens/first-run/4-passphrase-desktop-05-passphrase-ready.jpg" width="420"> | <img src="screens/first-run/4-passphrase-phone-05-passphrase-ready.jpg" width="190"> |
| **The recovery sheet (#37).**<br><br>**What is it?** The one code that opens the work if the passphrase is lost, with Download. **Must I do it now?** Yes, and it says why: Done waits for "I have saved it", and the line beside Done says so. **Later?** It is shown once. The toast says the work is now locked with the passphrase. | <img src="screens/first-run/4-passphrase-desktop-06-recovery-sheet.jpg" width="420"> | <img src="screens/first-run/4-passphrase-phone-06-recovery-sheet.jpg" width="190"> |
| **The home, with the lock line** (a passphrase now exists). | <img src="screens/first-run/4-passphrase-desktop-08-home.jpg" width="420"> | <img src="screens/first-run/4-passphrase-phone-08-home.jpg" width="190"> |

### 5. Existing passphrase user adds a key

A student who locked their work from the account menu (Lock my work with a passphrase) comes back another day. Connect AI skips 4d and locks the key under the existing passphrase. Then the AI connection and Settings.

| Screen | Desktop (1280 px) | Phone (375 px) |
| --- | --- | --- |
| **The account menu** (on a phone, the Menu) before any passphrase.<br><br>Settings and Lock my work with a passphrase are here. AI connection is the header's AI item ("Connect AI" in the phone Menu). | <img src="screens/first-run/5-vault-user-adds-key-desktop-01-account-menu.jpg" width="420"> | <img src="screens/first-run/5-vault-user-adds-key-phone-01-account-menu.jpg" width="190"> |
| **Another day: the work is locked** and the student cancelled the ask.<br><br>The home says the project is locked, with Unlock. The header reads 🔒 Locked and Connect AI. | <img src="screens/first-run/5-vault-user-adds-key-desktop-02-home-locked.jpg" width="420"> | <img src="screens/first-run/5-vault-user-adds-key-phone-02-home-locked.jpg" width="190"> |
| **Connect AI with a passphrase already set: 4d is skipped.**<br><br>The key is locked under the existing passphrase, so the unlock window asks for it once ("Unlock your work"). Cancel saves nothing, and Connect AI says so. | <img src="screens/first-run/5-vault-user-adds-key-desktop-03-unlock-to-lock-key.jpg" width="420"> | <img src="screens/first-run/5-vault-user-adds-key-phone-03-unlock-to-lock-key.jpg" width="190"> |
| **Connected.** The header reads AI: Gemini. | <img src="screens/first-run/5-vault-user-adds-key-desktop-04-connected.jpg" width="420"> | <img src="screens/first-run/5-vault-user-adds-key-phone-04-connected.jpg" width="190"> |
| **AI connection**, from the AI pill once a key exists.<br><br>The company, Test, Change key, Remove key, and how the key is kept (the two choices of 4d). No "This tab only". | <img src="screens/first-run/5-vault-user-adds-key-desktop-05-ai-connection.jpg" width="420"> | <img src="screens/first-run/5-vault-user-adds-key-phone-05-ai-connection.jpg" width="190"> |
| **Settings**, from the account menu.<br><br>Field of study, AI writing language (it follows the page language until chosen), ORCID iD, OpenAlex key, the fallback and the log, and the terms. It says "None of them is needed to start." It is never shown in first run. | <img src="screens/first-run/5-vault-user-adds-key-desktop-06-settings.jpg" width="420"> | <img src="screens/first-run/5-vault-user-adds-key-phone-06-settings.jpg" width="190"> |

The remaining captures of every path are in `screens/first-run/` (62 files).
