/* Where the library's catalogue lives.
   ────────────────────────────────────────────────────────────────────────
   This is baked into the app on purpose. A reader install must show the real
   library the moment it is opened — nobody at the madrassa should have to type
   a GitHub account name, a repository or a token just to look up a book.
   Only the librarian's own machine needs a token, and that is entered once in
   Settings; everything else here is fixed.

   When the repo moves to its own account, change it HERE and nowhere else. */

module.exports = {
  owner:  "tajbellucci",
  repo:   "maktaba",
  branch: "main",

  /* Publish freeze — currently OFF, by explicit instruction.
     ────────────────────────────────────────────────────────────────────────
     This was frozen before handover so only Taj could publish (through
     Claude Code, with his own token) while the live catalogue had drifted
     from testing data. That freeze caused its own real problem: a book
     added on the client's machine (معارف القرآن) had nowhere to go, and the
     reader-side background sync kept surfacing an unresolvable "Latest
     data" prompt every ~6 minutes because of it.
     Taj chose, explicitly (2026-09-12), to leave this unfrozen going
     forward: he publishes from the app's own master login like any other
     librarian, and reader machines pick it up normally on their next pull.
     This is a code-level flag, not a per-machine setting — it applies the
     moment this build reaches any machine, master or reader alike. Reader
     behaviour (pulling the latest data) is unaffected either way. */
  publishFrozen: false,

  /* The master-login backend. This is why a fresh install can offer master
     login without anyone pasting a URL and key into Settings first — the
     Supabase anon key is DESIGNED to be public (it is meant to sit inside a
     shipped app; Supabase's real access control is the Row Level Security
     policy on the server, not secrecy of this string). Nobody can claim
     master without also knowing a real librarian email and password, which
     this file does not and must never contain. */
  /* Whether borrower name, address and phone travel to the other machines.
     ────────────────────────────────────────────────────────────────────────
     Readers need these to run the desk, so this wants to be true. But it is
     only SAFE while the repository is private, because the catalogue is
     fetched from that repository and a public one is readable by anyone on
     the internet, not merely by the madrassa.

     true  + PRIVATE repo  → correct: readers see borrowers, outsiders cannot.
     true  + PUBLIC  repo  → every borrower's phone number is public. Never.
     false                 → readers see only that a book is out and its due
                             date; borrower details stay on the desk machine.

     Set to true here on the repository's current PUBLIC state, by explicit
     instruction — the madrassa was told plainly that borrower name and phone
     number become world-readable and confirmed they want that. Not a default
     for future projects; a deliberate choice made once, in the open. */
  publishBorrowerDetails: true,

  supabaseUrl: "https://iobffeudnktrzsjeejas.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYmZmZXVkbmt0cnpzamVlamFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NjQ1MjAsImV4cCI6MjEwMzI0MDUyMH0.DAfwEoV68O6qhcWbg-RW0V8MTI4Mix9iQm_NmZeeTc0"
};
