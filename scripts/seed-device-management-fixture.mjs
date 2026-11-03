// Fictional, explicit fixture for the opt-in Android integration runner. Never production data.
import postgres from 'postgres';
import { createHmac, randomUUID } from 'node:crypto';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Only a disposable *_test database is allowed.');
const sql = postgres(databaseUrl);
const familyId = '22222222-2222-4222-8222-222222222222';
const childId = '22222222-2222-4222-8222-222222222223';
const parentId = '22222222-2222-4222-8222-222222222224';
if ((await sql`select id from families where id=${familyId}`).length) { await sql.end(); throw new Error('Fixture already exists. Use a fresh disposable database.'); }
const hash = token => createHmac('sha256','issue22-only-fictional-session-secret-32chars').update(token).digest('hex');
await sql`insert into families(id,name,timezone) values(${familyId},'Testfamilie','Europe/Berlin') on conflict do nothing`;
await sql`insert into children(id,"familyId",name,avatar,"buddyName") values(${childId},${familyId},'Mika','M','Fino') on conflict do nothing`;
await sql`insert into parents(id,"familyId",name,email,"passwordHash") values(${parentId},${familyId},'Test-Eltern','test22@example.test','unused') on conflict do nothing`;
await sql`insert into parent_sessions("tokenHash","parentId","expiresAt") values(${hash('p'.repeat(43))},${parentId},now()+interval '2 hours') on conflict do nothing`;
await sql`insert into device_pairing_codes("familyId","childId",kind,label,"codeHash","expiresAt") values(${familyId},${childId},'android','Mikas Smartphone',${hash('issue22-fictional-pairing')},now()+interval '2 hours') on conflict do nothing`;
await sql`insert into allowed_apps("familyId","childId","packageName",label) values(${familyId},${childId},'com.google.android.deskclock','Uhr') on conflict do nothing`;
await sql`insert into child_messages("familyId","childId",sender,"senderId","requestId",body,"createdAt") values(${familyId},${childId},'parent',${parentId},${randomUUID()},'Hallo Mika! Wie war dein Tag? 🌿',now()-interval '5 minutes')`;
await sql`insert into child_messages("familyId","childId",sender,"senderId","requestId",body,"createdAt") values(${familyId},${childId},'child',${randomUUID()},${randomUUID()},'Schön! Wir haben heute draußen gespielt.',now()-interval '4 minutes')`;
await sql`insert into child_messages("familyId","childId",sender,"senderId","requestId",body,"createdAt") values(${familyId},${childId},'parent',${parentId},${randomUUID()},'Das klingt toll. Das Essen ist gleich fertig. Kommst du dann zu uns?',now()-interval '3 minutes')`;
await sql.end(); console.log('Fictional household ready');
