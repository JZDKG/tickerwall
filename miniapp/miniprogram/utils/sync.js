/* ================================================================== *
 * 自选同步 + 远程配置
 *
 * 定位：**登录是可选的增强，不是使用门槛**。没登录时自选仍然存在本机
 * （store.js），行情、事件、关联全都照常；登录之后才把自选同步到云端，
 * 换设备能拉回来。所以这里不做「先登录才能用」的拦截。
 *
 * 数据安全交给数据库：owner_id 由 DEFAULT auth.uid() 填，RLS 只放行本人
 * 的行。前端不发 owner_id，也不拿 owner_id 当权限判断 —— 它只决定界面
 * 显示谁，不决定能读到谁。
 * ================================================================== */

const { cloud } = require('./cloud');

const WATCH_TABLE = 'watchlist_items';
const CONFIG_TABLE = 'app_config';

/** 把 SDK 的 error 归一成人话；code 是稳定的，message 只做兜底 */
function describe(err) {
  if (!err) return '未知错误';
  const code = err.code || (err.cause && err.cause.code) || '';
  if (code === '23505') return '这个标的已经在自选里了';
  if (code === '42501') return '没有权限修改自选的云端数据';
  if (code === '42P01') return '云端数据表还没创建，请先初始化数据库';
  if (code === 'NOT_FOUND_OR_FORBIDDEN') return '记录不存在或无权修改';
  return err.message || String(err);
}

function isReady() {
  return !!cloud;
}

/** 当前登录会话；未登录返回 null（不是错误） */
async function getSession() {
  if (!cloud) return { session: null, error: '云服务未初始化' };
  try {
    const { data, error } = await cloud.auth.getSession();
    if (error) return { session: null, error: describe(error) };
    return { session: data || null, error: '' };
  } catch (err) {
    return { session: null, error: describe(err) };
  }
}

async function signOut() {
  if (!cloud) return { error: '云服务未初始化' };
  try {
    const { error } = await cloud.auth.signOut();
    return { error: error ? describe(error) : '' };
  } catch (err) {
    return { error: describe(err) };
  }
}

/** 拉取云端自选（按加入时间升序）。失败抛错，由调用方决定是否提示 */
async function pullWatchlist() {
  if (!cloud) throw new Error('云服务未初始化');
  const { data, error } = await cloud.database
    .from(WATCH_TABLE)
    .select('instrument_id, created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(describe(error));
  return (Array.isArray(data) ? data : []).map((row) => row.instrument_id).filter(Boolean);
}

/** 把本地列表同步成云端的样子：多的删、缺的补，不整表重写 */
async function pushWatchlist(ids) {
  if (!cloud) throw new Error('云服务未初始化');
  const next = Array.from(new Set(ids || []));
  const current = await pullWatchlist();

  const toAdd = next.filter((id) => current.indexOf(id) < 0);
  const toRemove = current.filter((id) => next.indexOf(id) < 0);

  if (toAdd.length) {
    const { error } = await cloud.database
      .from(WATCH_TABLE)
      .insert(toAdd.map((instrument_id) => ({ instrument_id })));
    if (error) throw new Error(describe(error));
  }

  if (toRemove.length) {
    // 只删本人这次真的移除的几行；RLS 保证碰不到别人的
    const { error } = await cloud.database.from(WATCH_TABLE).delete().in('instrument_id', toRemove);
    if (error) throw new Error(describe(error));
  }

  return { added: toAdd.length, removed: toRemove.length };
}

/**
 * 首次登录后的合并：云端为空就把本地推上去；云端有数据就以云端为准。
 * 不做「并集」——两边都改过时并集会让用户删不掉东西。
 */
async function syncOnLogin(localIds) {
  let remote = [];
  try {
    remote = await pullWatchlist();
  } catch (err) {
    return { ids: localIds, error: describe(err), pushed: 0 };
  }

  if (!remote.length && (localIds || []).length) {
    try {
      const res = await pushWatchlist(localIds);
      return { ids: localIds, error: '', pushed: res.added };
    } catch (err) {
      return { ids: localIds, error: describe(err), pushed: 0 };
    }
  }

  return { ids: remote, error: '', pushed: 0 };
}

/** 公共只读的远程配置（文案/免责声明），改动不用重新发版 */
async function loadRemoteConfig() {
  if (!cloud) return null;
  try {
    const { data, error } = await cloud.database.from(CONFIG_TABLE).select('key, value');
    if (error) return null;
    const map = {};
    for (const row of Array.isArray(data) ? data : []) map[row.key] = row.value;
    return Object.keys(map).length ? map : null;
  } catch (err) {
    return null;
  }
}

module.exports = {
  isReady,
  getSession,
  signOut,
  pullWatchlist,
  pushWatchlist,
  syncOnLogin,
  loadRemoteConfig,
};
