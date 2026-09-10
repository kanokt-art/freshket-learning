const admin = require('firebase-admin');
const serviceAccount = require('./lms-sale-project-firebase-adminsdk-fbsvc-44bc76c1e5.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Teams to restore (original IDs preserved → members auto-snap back)
const TEAMS = [
  { id: 'team-1782144330659', name: "ทีม P'Name A",        departmentId: 'dept-key-account-management' },
  { id: 'team-1782144233766', name: "ทีม P'Ploiiy A",      departmentId: 'dept-key-account-management' },
  { id: 'team-1782808567936', name: "ทีม P'Name-Ploiiy",   departmentId: 'dept-key-account-management' },
  { id: 'team-1782808507513', name: "ทีม P'Ploiiy B",      departmentId: 'dept-key-account-management' },
]

// Nicknames of unassigned members + which team to assign them to
const ASSIGN_BY_NICKNAME = {
  'Dent':   'team-1782144330659',  // LM = Name
  'Nitcha': 'team-1782144330659',  // LM = Name
  'Ply':    'team-1782144233766',  // LM = Ploiiy
  'Pop':    'team-1782144233766',  // LM = Ploiiy
  'Ninew':  'team-1782144233766',  // LM = Ploiiy
  'Oh':     'team-1782144233766',  // LM = Ploiiy
  'Ice':    'team-1782144233766',  // LM = Ploiiy
}

async function restore() {
  // ── Step 1: fetch all users ──────────────────────────────────────────────
  const snap = await db.collection('users').get()
  const allUsers = []
  snap.forEach(doc => allUsers.push({ docId: doc.id, ...doc.data() }))
  console.log(`Loaded ${allUsers.length} users from Firestore`)

  // ── Step 2: build nickname → uid map for unassigned targets ─────────────
  const batch = db.batch()
  const nicknamesToAssign = Object.keys(ASSIGN_BY_NICKNAME)
  const matched = []
  const notFound = []

  for (const nick of nicknamesToAssign) {
    // Match against `nickname` field (case-insensitive)
    const user = allUsers.find(u =>
      (u.nickname || '').toLowerCase() === nick.toLowerCase()
    )
    if (user) {
      const uid = user.uid || user.docId
      const targetTeamId = ASSIGN_BY_NICKNAME[nick]
      matched.push({ nick, uid, email: user.email, currentTeam: user.teamId || 'NONE', targetTeamId })
      batch.set(db.collection('users').doc(uid), { teamId: targetTeamId }, { merge: true })
    } else {
      notFound.push(nick)
    }
  }

  // ── Step 3: create/overwrite 4 team documents ───────────────────────────
  for (const team of TEAMS) {
    batch.set(db.collection('teams').doc(team.id), {
      id:           team.id,
      name:         team.name,
      departmentId: team.departmentId,
    })
  }

  // ── Step 4: commit ───────────────────────────────────────────────────────
  await batch.commit()

  // ── Report ───────────────────────────────────────────────────────────────
  console.log('\n✅ Created / updated 4 team documents:')
  for (const t of TEAMS) {
    console.log(`  ${t.id}  →  "${t.name}"`)
  }

  console.log('\n✅ Assigned unassigned members:')
  for (const m of matched) {
    console.log(`  ${m.nick} (${m.email})  ${m.currentTeam} → ${m.targetTeamId}`)
  }

  if (notFound.length) {
    console.log('\n⚠️  Nicknames not found in Firestore (check spelling):')
    for (const n of notFound) console.log(`  - ${n}`)
  } else {
    console.log('\n✅ All 7 members found and assigned.')
  }
}

restore()
  .then(() => { console.log('\nDone.'); process.exit(0) })
  .catch(err => { console.error(err); process.exit(1) })
