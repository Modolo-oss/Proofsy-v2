const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const store = {
  async save(p) {
    await prisma.eventPersist.create({
      data: {
        idempotencyKey: p.idempotencyKey,
        bookingId: p.event.bookingId,
        propertyId: p.event.propertyId,
        eventType: p.event.eventType,
        actor: p.event.actor,
        occurredAt: new Date(p.event.occurredAt),
        metadataJson: JSON.stringify(p.event.metadata || {}),
        mediaCid: p.event.mediaCid || null,
        txHash: p.receipt.txHash,
        nid: p.receipt.nid,
        chain: p.receipt.chain,
      }
    });
  },
  async getByIdempotencyKey(k) {
    const r = await prisma.eventPersist.findUnique({ where: { idempotencyKey: k } });
    return r ? rowToApi(r) : null;
  },
};

async function findByBooking(bookingId) {
  const rows = await prisma.eventPersist.findMany({ where: { bookingId }, orderBy: { occurredAt: 'asc' } });
  return rows.map(rowToApi);
}

async function findByNid(nid) {
  const r = await prisma.eventPersist.findFirst({ where: { nid } });
  return r ? rowToApi(r) : null;
}

function rowToApi(r) {
  return {
    event: {
      eventType: r.eventType,
      bookingId: r.bookingId,
      propertyId: r.propertyId,
      actor: r.actor,
      occurredAt: new Date(r.occurredAt).toISOString(),
      metadata: JSON.parse(r.metadataJson || '{}'),
      mediaCid: r.mediaCid || undefined,
    },
    receipt: { txHash: r.txHash, nid: r.nid, chain: r.chain },
    idempotencyKey: r.idempotencyKey,
  };
}

module.exports = { store, findByBooking, findByNid };


