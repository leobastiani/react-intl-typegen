#!/usr/bin/env node
/* eslint-disable */

import { readFile } from "node:fs/promises";
import { parse, TYPE } from "@formatjs/icu-messageformat-parser";

(async () => {
  const translations = JSON.parse(
    (
      await readFile(
        "./src/assets/translations/pt-PT/translations.json",
        "utf-8"
      )
    ).replace(/^\uFEFF/, "")
  );

  // const translations = {
  //   leo: 'Convite de {therapistName}, para o dia {date, date} {number, number} {time, time}, <b>às</b> <b>{leo}</b> {hour}h{minute, select, 0 {# leo} other {<d>{minute}</d>}}. {plural, plural, one {# pessoa} other {# pessoas}}',
  // };

  function getValues(str) {
    if (typeof str !== "string") {
      return [];
    }

    const parsed = parse(str);
    const variables = [];

    function req(parsed) {
      for (const e of parsed) {
        if (e.type === TYPE.literal || e.type === TYPE.pound) {
          continue;
        }
        const myVar = {
          name: e.value,
          type: e.type,
          e,
        };
        variables.push(myVar);
        if (e.children?.length) {
          req(e.children);
        }
        if (e.options) {
          for (const option of Object.values(e.options)) {
            req(option.value);
          }
        }
      }
    }
    req(parsed);
    return variables;
  }

  const crowdin = Object.entries(translations).map(([id, value]) => ({
    id,
    values: getValues(value),
  }));

  function valuesToString(values) {
    return `{${values
      .map(
        ({ name, type }) =>
          `${name}${name === "b" && type === TYPE.tag ? "?" : ""}: ${(() => {
            if (type === TYPE.date) {
              return "Date";
            }
            if (type === TYPE.time) {
              return "Date";
            }
            if (type === TYPE.number || type === TYPE.plural) {
              return "number";
            }
            if (type === TYPE.tag) {
              return "(chunks: string) => Node";
            }
            return "string | number";
          })()}`
      )
      .join("; ")}}`;
  }

  function questionMarkInValues(values) {
    if (
      values.length === 1 &&
      values[0].type === TYPE.tag &&
      values[0].name === "b"
    ) {
      return "?";
    }
    return "";
  }

  console.log(`/* eslint-disable */

  // enable me in tsconfig, uncomment "react-intl": ["./react-intl-custom"]
  import * as React from 'react';

  import { IntlFormatters, IntlShape as IntlShapeOrig } from 'react-intl-orig';

  export * from 'react-intl-orig';

  type Crowdin<Node = string | number> = ${crowdin
    .map(
      ({ id, values }) =>
        `{id:'${id}'${
          values.length === 0
            ? ""
            : `, values${questionMarkInValues(values)}: ${valuesToString(
                values
              )}`
        }}`
    )
    .join("|")};
  export const FormattedMessage: React.ComponentType<Crowdin<React.ReactNode> & {
    children?(nodes: React.ReactNode[]): React.ReactElement | null;
  }>;

  type ApplyValuesOptional<T extends { id: string }> = T extends {
    values?: any;
  }
    ? undefined extends T['values']
      ? [id: { id: T['id'] }, values?: T['values']]
      : [id: { id: T['id'] }, values: T['values']]
    : [id: { id: T['id'] }];

  function formatMessage<const T extends Crowdin['id']>(
    ...args: ApplyValuesOptional<Extract<Crowdin, { id: T }>>
  ): string;

  export type IntlShape = Omit<IntlShapeOrig, keyof IntlFormatters> & {
    formatMessage: typeof formatMessage;
  };
  export function useIntl(): IntlShape;
  `);
})();
