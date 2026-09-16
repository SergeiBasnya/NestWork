import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, RoomType } from '@prisma/client';
import { hash } from 'bcryptjs';
import { readSeedConfig } from './seedConfig';

// Validate every credential and the production guard before opening a DB
// connection or performing any write.
const seedConfig = readSeedConfig(process.env);
const pool = new Pool({ connectionString: seedConfig.databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// The single private workspace shared by the 2 accounts.
const WORKSPACE_SLUG = 'nestwork';

const ACCOUNTS = seedConfig.accounts;

// One large open sandbox (in PIXELS). Not drawn — it just gives furniture an
// area to live in. Users decorate it freely; the camera can zoom in/out.
const roomDefs = [
  { name: 'Espace', type: RoomType.OPEN, posX: 0, posY: 0, width: 2400, height: 1600 },
];

async function main() {
  console.log('Seeding database...');

  // Create the 2 accounts
  const users = [];
  for (const acc of ACCOUNTS) {
    const passwordHash = await hash(acc.password, 12);
    const user = await prisma.user.upsert({
      where: { email: acc.email },
      update: { name: acc.name, passwordHash },
      create: { email: acc.email, passwordHash, name: acc.name },
    });
    users.push({ ...user, role: acc.role });
    console.log(`  User: ${user.email} (${acc.role})`);
  }

  const owner = users.find((u) => u.role === 'OWNER')!;

  // Create the single workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: WORKSPACE_SLUG },
    update: {},
    create: {
      name: 'NestWork',
      slug: WORKSPACE_SLUG,
      description: 'Espace privé',
      ownerId: owner.id,
    },
  });
  console.log(`  Workspace: ${workspace.name} (/${workspace.slug})`);

  // Add both users as members
  for (const u of users) {
    await prisma.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: u.id, workspaceId: workspace.id } },
      update: { role: u.role },
      create: { userId: u.id, workspaceId: workspace.id, role: u.role },
    });
  }

  // Create rooms only if the workspace has none yet (idempotent reseed)
  const existingRooms = await prisma.room.count({ where: { workspaceId: workspace.id } });
  if (existingRooms === 0) {
    for (const def of roomDefs) {
      await prisma.room.create({
        data: {
          workspaceId: workspace.id,
          name: def.name,
          type: def.type,
          posX: def.posX,
          posY: def.posY,
          width: def.width,
          height: def.height,
        },
      });
      console.log(`  Room: ${def.name}`);
    }
  }

  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
