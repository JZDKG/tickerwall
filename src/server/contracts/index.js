/* ================================================================== *
 * 契约校验（方案 E04 / §4.3）
 *
 * 为什么用 schema 而不是一堆 if：单位、值域、时间三件事在四个出口都要判
 * （来源适配 → 观测落库 → 解释生成 → HTTP 响应），散着写迟早会漂。
 * schema 是唯一来源，校验器只有一份实现。
 *
 * 三条纪律：
 *   1. **校验失败不返回空数组**：调用方拿到 {ok:false, errors}，自己决定是
 *      记质量标记还是拒绝入库；不允许「静默过滤」。
 *   2. 错误里带**字段路径**（`/value`、`/observedAt`），这样日志能直接指向
 *      是哪一家的哪个字段坏了。
 *   3. 校验器编译一次、复用；Ajv 的 `allowUnionTypes` 打开，因为 schema 里
 *      大量用 `["string","null"]` 表达「允许缺失但必须显式写 null」。
 * ================================================================== */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Ajv = require('ajv');
// Ajv v8 把 format（date / date-time）拆到了 ajv-formats：不注册的话
// `format` 会被静默忽略 —— 也就是「日期格式错了也判通过」，比不校验更危险。
const addFormats = require('ajv-formats');

const CONTRACTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../contracts');

function loadSchema(name) {
  return JSON.parse(readFileSync(path.join(CONTRACTS_DIR, `${name}.schema.json`), 'utf8'));
}

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
addFormats(ajv);
const validators = {
  observation: ajv.compile(loadSchema('observation')),
  dataQuality: ajv.compile(loadSchema('data-quality')),
  explanationEnvelope: ajv.compile(loadSchema('explanation-envelope')),
};

/** Ajv 的 errors → ['/value: must be number', ...] */
function toErrorList(errors) {
  return (errors ?? []).map((e) => {
    const where = e.instancePath || '/';
    const extra = e.params && Object.keys(e.params).length ? ` (${JSON.stringify(e.params)})` : '';
    return `${where}: ${e.message}${extra}`;
  });
}

/**
 * @typedef {{ok:boolean, errors:string[]}} ContractResult
 */

/** @returns {ContractResult} */
export function validateObservation(obs) {
  const ok = validators.observation(obs);
  return { ok, errors: ok ? [] : toErrorList(validators.observation.errors) };
}

/** @returns {ContractResult} */
export function validateDataQuality(q) {
  const ok = validators.dataQuality(q);
  return { ok, errors: ok ? [] : toErrorList(validators.dataQuality.errors) };
}

/** @returns {ContractResult} */
export function validateExplanationEnvelope(env) {
  const ok = validators.explanationEnvelope(env);
  return { ok, errors: ok ? [] : toErrorList(validators.explanationEnvelope.errors) };
}

/**
 * 批量校验观测，返回「合格 / 不合格」两组。
 *
 * 不合格的**不丢**：调用方要把它们带上质量标记留在列表里，页面上才能说
 * 「有 N 条观测没通过契约校验」，而不是数字莫名少了一截。
 *
 * @param {object[]} list
 * @returns {{valid:object[], invalid:{item:object, errors:string[]}[]}}
 */
export function partitionObservations(list = []) {
  const valid = [];
  const invalid = [];
  for (const item of list) {
    const { ok, errors } = validateObservation(item);
    if (ok) valid.push(item);
    else invalid.push({ item, errors });
  }
  return { valid, invalid };
}

/** 供测试与 doctor 用：确认 schema 本身能被编译 */
export function contractInfo() {
  return {
    dir: CONTRACTS_DIR,
    contracts: Object.keys(validators),
  };
}
