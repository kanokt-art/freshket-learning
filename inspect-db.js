const admin = require('firebase-admin');
const serviceAccount = require('./lms-sale-project-firebase-adminsdk-fbsvc-44bc76c1e5.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function inspect() {
  console.log('--- USERS IN KA OR PORTFOLIO ---');
  const usersSnap = await db.collection('users').get();
  let count = 0;
  usersSnap.forEach(doc => {
    const u = doc.data();
    const dept = u.department || '';
    if (dept.includes('Key Account') || dept.includes('Portfolio')) {
      console.log(`User: ${u.displayName} (${u.nickname || ''}) | Dept: ${u.department} | TeamId: ${u.teamId || 'NONE'} | Role: ${u.role}`);
      count++;
    }
  });
  console.log(`Total: ${count} users`);
}

inspect().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
