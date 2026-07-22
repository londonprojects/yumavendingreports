import {API_PATHS} from './config';
import {apiRequest} from './client';

const DEFAULT_PAGE_SIZE = 100;

const fetchPaginatedList = async (path, {query = {}, pageSize = DEFAULT_PAGE_SIZE} = {}) => {
  const firstPage = await apiRequest(path, {
    query: {...query, page: 1, page_size: pageSize},
  });

  let items = [...(firstPage.list ?? [])];
  const total = firstPage.total ?? items.length;
  let cursor = firstPage.next_cursor;
  let page = 2;

  while (cursor) {
    const nextPage = await apiRequest(path, {
      query: {...query, cursor, page_size: pageSize},
    });
    const nextList = nextPage.list ?? [];
    for (let i = 0; i < nextList.length; i++) {
      items.push(nextList[i]);
    }
    cursor = nextPage.next_cursor;
    page += 1;
    if (!nextPage.list?.length || items.length >= total || page > 50) {
      break;
    }
  }

  while (!cursor && items.length < total && page <= Math.ceil(total / pageSize)) {
    const nextPage = await apiRequest(path, {
      query: {...query, page, page_size: pageSize},
    });
    const nextList = nextPage.list ?? [];
    for (let i = 0; i < nextList.length; i++) {
      items.push(nextList[i]);
    }
    if (!nextPage.list?.length) {
      break;
    }
    page += 1;
  }

  return items;
};

export const getMarkets = query => fetchPaginatedList(API_PATHS.markets, {query});

export const getMarket = stickerNum =>
  apiRequest(`${API_PATHS.markets}/${encodeURIComponent(stickerNum)}`);

export const getMarketOnlineStatus = stickerNum =>
  apiRequest(`${API_PATHS.markets}/${encodeURIComponent(stickerNum)}/online-status`);

export const getPlanogram = stickerNum =>
  apiRequest(`${API_PATHS.markets}/${encodeURIComponent(stickerNum)}/planograms`);

export const getProducts = query => fetchPaginatedList(API_PATHS.products, {query});

export const getSales = query => fetchPaginatedList(API_PATHS.sales, {query});

export const getSale = orderNo =>
  apiRequest(`${API_PATHS.sales}/${encodeURIComponent(orderNo)}`);

export const getRestockRecords = query =>
  fetchPaginatedList(API_PATHS.restockRecords, {query});

export const getMarketRestockRecords = (stickerNum, query) =>
  fetchPaginatedList(`${API_PATHS.markets}/${encodeURIComponent(stickerNum)}/restock`, {
    query,
  });

export const getRestockOpLogDetail = (stickerNum, opLogId) =>
  apiRequest(
    `${API_PATHS.markets}/${encodeURIComponent(stickerNum)}/restock/op-logs/${encodeURIComponent(opLogId)}`,
  );

export const getInventoryProducts = query =>
  fetchPaginatedList(API_PATHS.inventoryProducts, {query});

export const getInventoryProduct = productNo =>
  apiRequest(`${API_PATHS.inventoryProducts}/${encodeURIComponent(productNo)}`);
