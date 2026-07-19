HOW TO ADD YOUR OWN CHILDREN'S SONGS
====================================

This "music" folder holds the songs that the Music player on the parent
unit plays for the baby (they play out loud on the baby unit and loop the
whole playlist until you press Stop).

To add a song:

1. Copy your .mp3 file into this "music" folder.
2. Open "playlist.json" (in this same folder) with any text editor.
3. Add one line for your song inside the "songs" list, for example:

   { "file": "myfilename.mp3", "title": "My Song Title" }

   - "file"  = the exact file name of the mp3 (must match, case-sensitive)
   - "title" = the name shown in the app

   Separate each song with a comma. The last song has NO comma after it.

Example playlist.json with two songs:

{
  "songs": [
    { "file": "moonlightlullaby.mp3", "title": "Moonlight Lullaby" },
    { "file": "myfilename.mp3", "title": "My Song Title" }
  ]
}

4. Upload the mp3 file and the updated playlist.json to the "music" folder
   on your hosting (next to index.html). Done — the new song appears in the
   playlist automatically.

Tips:
- Use plain file names without spaces or accents (e.g. lullaby_2.mp3).
- MP3 format works best across phones and computers.
