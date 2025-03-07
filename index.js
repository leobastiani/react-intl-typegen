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

  function parseAndGetValues(str) {
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

  function toTypeString(type) {
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
  }

  function valuesToString(values) {
    return `{${values
      .map(
        ({ name, type }) =>
          `${name}${
            name === "b" && type === TYPE.tag ? "?" : ""
          }: ${toTypeString(type)}`
      )
      .join("; ")}}`;
  }

  const crowdin = Object.entries(translations)
    // .filter(([id]) => id === "EXAMPLE")
    .map(([id, crowdinValue]) => {
      const values = parseAndGetValues(crowdinValue);
      const groupedValues = {};
      for (const value of values) {
        groupedValues[value.name] ??= new Set();
        groupedValues[value.name].add(toTypeString(value.type));
      }
      const groupedValuesString = Object.fromEntries(
        Object.entries(groupedValues).map(([key, value]) => {
          return [
            key,
            `${
              value.size === 1
                ? value.values().next().value
                : `(${[...value].map((x) => `(${x})`).join(" & ")})`
            }`,
          ];
        })
      );
      const isOptional =
        Object.values(groupedValuesString).length === 1 &&
        groupedValuesString.b === toTypeString(TYPE.tag);
      const outputType =
        Object.entries(groupedValuesString).length === 0
          ? ""
          : `{${Object.entries(groupedValuesString)
              .map(([key, value]) => {
                const isOptional =
                  key === "b" && value === toTypeString(TYPE.tag);
                return `${key}${isOptional ? "?" : ""}: ${value}`;
              })
              .join(";")}}`;
      return {
        id,
        isOptional,
        outputType,
      };
    });

  console.log(`/* eslint-disable */

// enable me in tsconfig, uncomment "react-intl": ["./react-intl-custom"]
import * as React from 'react';

import { IntlFormatters, IntlShape as IntlShapeOrig } from 'react-intl-orig';

export * from 'react-intl-orig';

type Crowdin<Node = string | number> = ${crowdin
    .map(
      ({ id, isOptional, outputType }) =>
        `{id:'${id}'${
          outputType && `, values${isOptional ? "?" : ""}: ${outputType}`
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
