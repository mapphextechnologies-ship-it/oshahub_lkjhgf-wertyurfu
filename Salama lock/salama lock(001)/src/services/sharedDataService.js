export class SharedDataUnavailableError extends Error {
  constructor(resource, sourceError = null) {
    super(`Unable to load live ${resource}. Check the connection and sign in again.`);
    this.name = 'SharedDataUnavailableError';
    this.code = 'SHARED_DATA_UNAVAILABLE';
    this.resource = resource;
    this.statusCode = Number(sourceError?.statusCode || 0) || null;
    this.cause = sourceError || null;
  }
}

export async function readSharedData({ resource = 'records', primary, secondary = null } = {}) {
  try {
    return await primary();
  } catch (primaryError) {
    if (secondary) {
      try {
        return await secondary();
      } catch (secondaryError) {
        throw new SharedDataUnavailableError(resource, secondaryError || primaryError);
      }
    }

    throw new SharedDataUnavailableError(resource, primaryError);
  }
}
