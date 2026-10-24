/**
 * Library entries as v1 stored them, without the `pid` every save now gives them (wave B, Task 17): the tests that compare a library after an update to v1's golden entries
 * compare the fields v1 wrote; that each entry gets its pid is pinned in paperIdsLibrary.test.tsx.
 */
export const noPids = <T extends object>(lib: T[]): T[] => lib.map((e) => { const { pid: _pid, ...rest } = e as T & { pid?: unknown }; return rest as T; });
