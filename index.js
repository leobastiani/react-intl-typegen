#!/usr/bin/env node
/* eslint-disable */

import { parse, TYPE } from "@formatjs/icu-messageformat-parser";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { docopt } from "docopt";

const args = docopt(
  `
Usage:
  react-intl-typegen [options] <file>...
Options:
  -h --help               Show this screen.
  -d --debug              Debug mode.
  -o --optional-tags=<o>  Optional tags, example "b,i" will make optional <b> and <i>.
`.trim()
);

args["--optional-tags"] = args["--optional-tags"]?.split(",") ?? [];

// copied from https://github.com/hughsk/flat/blob/f69225d3ef332fcb6951ec9e89706eb3aa986039/index.js
function flatten(target) {
  const output = {};

  function step(object, prev) {
    Object.keys(object).forEach(function (key) {
      const value = object[key];
      const type = Object.prototype.toString.call(value);
      const isobject = type === "[object Object]" || type === "[object Array]";

      const newKey = prev ? `${prev}.${key}` : key;

      if (isobject && Object.keys(value).length) {
        return step(value, newKey);
      }

      output[newKey] = value;
    });
  }

  step(target);

  return output;
}

(async () => {
  const filePaths = args["<file>"];
  if (filePaths.length === 0) {
    console.log("Usage: react-intl-typegen [...files]");
    process.exit(1);
  }
  for (const filePath of filePaths) {
    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
  }
  const translations = await Promise.all(
    filePaths.map(async (filePath) =>
      flatten(
        JSON.parse((await readFile(filePath, "utf-8")).replace(/^\uFEFF/, ""))
      )
    )
  );

  const allIds = new Set();
  for (const translation of translations) {
    for (const id in translation) {
      allIds.add(id);
    }
  }

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
    return "Node";
  }

  const crowdin = Array.from(allIds)
    // .filter(([id]) => id === "EXAMPLE")
    .map((id) => {
      const values = translations
        .map((translation) => translation[id])
        .filter(Boolean)
        .map((v) => parseAndGetValues(v))
        .flat(1);
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
      const isOptional = Object.entries(groupedValuesString).every(
        ([id, type]) => {
          return (
            args["--optional-tags"].includes(id) &&
            type === toTypeString(TYPE.tag)
          );
        }
      );
      const outputType =
        Object.keys(groupedValuesString).length === 0
          ? ""
          : `{${Object.entries(groupedValuesString)
              .map(([key, value]) => {
                const isOptional =
                  args["--optional-tags"].includes(key) &&
                  value === toTypeString(TYPE.tag);
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

type Crowdin<Node = string | number> = {${crowdin
    .map(
      ({ id, isOptional, outputType }) =>
        `'${id}':${
          outputType || 'never'
        }`
    )
    .join(";")}};

type CrowdinComponent = Crowdin<React.ReactNode>;
type CrowdinFunction = Crowdin<string | number>;
type KeyOfCrowdin = keyof Crowdin;

type IsNull<T> = [T] extends [null] ? true : false;

type IsUnknown<T> = unknown extends T
  ? IsNull<T> extends false
    ? true
    : false
  : false;

type RequiredKeysOf<BaseType extends object> = Exclude<
  {
    [Key in keyof BaseType]: BaseType extends Record<Key, BaseType[Key]>
      ? Key
      : never;
  }[keyof BaseType],
  undefined
>;

type IfHasRequiredKeys<
  BaseType extends object,
  IfTrue,
  IfFalse,
> = RequiredKeysOf<BaseType> extends never ? IfFalse : IfTrue;

type WithValues<Props, Values> = [Values] extends [never]
  ? Props
  : Props & IfHasRequiredKeys<Values, { values: Values }, { values?: Values }>;

type ApplyValuesOptional<Values> = [Values] extends [never] ? [] : IfHasRequiredKeys<Values, [values: Values], [values?: Values]>;

export function FormattedMessage<const T extends KeyOfCrowdin>(
  props: WithValues<
    {
      id: T;
      children?: (nodes: React.ReactNode[]) => React.ReactElement | null;
    },
    CrowdinComponent[T]
  >,
): JSX.Element;

function formatMessage<const T extends KeyOfCrowdin>(
  id: { id: T },
  ...args: ApplyValuesOptional<CrowdinFunction[T]>
): string;

export type IntlShape = Omit<IntlShapeOrig, keyof IntlFormatters> & {
  formatMessage: typeof formatMessage;
};
export function useIntl(): IntlShape;`);
})();
