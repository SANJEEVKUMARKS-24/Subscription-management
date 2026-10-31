function parsePagination(query = {}) {
  const requestedLimit = Number.parseInt(query.limit, 10);
  const requestedOffset = Number.parseInt(query.offset, 10);
  const limit = Math.min(Math.max(Number.isInteger(requestedLimit) ? requestedLimit : 20, 1), 100);
  const offset = Math.max(Number.isInteger(requestedOffset) ? requestedOffset : 0, 0);
  return { limit, offset };
}

function paginationMeta({ limit, offset, total }) {
  const safeTotal = Number(total) || 0;
  return {
    page: Math.floor(offset / limit) + 1,
    limit,
    offset,
    total: safeTotal,
    totalPages: Math.ceil(safeTotal / limit),
    hasPrevious: offset > 0,
    hasNext: offset + limit < safeTotal,
  };
}

module.exports = { parsePagination, paginationMeta };
