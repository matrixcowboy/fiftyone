import "react";
import { selectorFamily } from "recoil";

import {
  BOOLEAN_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
  LABELS,
  OBJECT_ID_FIELD,
  STRING_FIELD,
  VALID_PRIMITIVE_TYPES,
} from "@fiftyone/utilities";

import * as schemaAtoms from "../../recoil/schema";
import * as selectors from "../../recoil/selectors";
import { State } from "../../recoil/types";

import { filter as boolean } from "./booleanState";
import { filter as string } from "./stringState";
import { filter as numeric } from "./numericState";

import BooleanFieldFilter from "./BooleanFieldFilter";
import NumericFieldFilter from "./NumericFieldFilter";
import StringFieldFilter from "./StringFieldFilter";
import { matchedTags } from "../../recoil/filters";

export { BooleanFieldFilter, NumericFieldFilter, StringFieldFilter };

const primitiveFilter = selectorFamily<
  (value: any) => boolean,
  { modal: boolean; path: string }
>({
  key: "primitiveFilter",
  get: ({ modal, path }) => ({ get }) => {
    const { ftype } = get(schemaAtoms.field(path));
    if (ftype === BOOLEAN_FIELD) {
      return get(boolean({ modal, path }));
    }

    if (
      [
        FLOAT_FIELD,
        FRAME_NUMBER_FIELD,
        FRAME_SUPPORT_FIELD,
        INT_FIELD,
      ].includes(ftype)
    ) {
      return get(numeric({ modal, path }));
    }

    if ([OBJECT_ID_FIELD, STRING_FIELD].includes(ftype)) {
      return get(string({ modal, path }));
    }

    return (value) => true;
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const pathFilter = selectorFamily<
  (path: string, value: any) => boolean,
  boolean
>({
  key: "pathFilter",
  get: (modal) => ({ get }) => {
    const paths = get(schemaAtoms.activeFields({ modal }));
    const hidden = get(selectors.hiddenLabelIds);
    const matchedLabelTags = get(
      matchedTags({ key: State.TagKey.LABEL, modal })
    );

    const filters = paths.reduce((f, path) => {
      if (path.startsWith("_")) return f;

      const { embeddedDocType } = get(schemaAtoms.field(path));

      if (LABELS.includes(embeddedDocType)) {
        const expandedPath = get(schemaAtoms.expandPath(path));
        const labelFields = get(
          schemaAtoms.fields({
            path: expandedPath,
            ftype: VALID_PRIMITIVE_TYPES,
          })
        );

        const fs = labelFields.map(({ name, dbField }) => {
          const filter = get(
            primitiveFilter({ modal, path: `${expandedPath}.${name}` })
          );

          return (value: any) =>
            filter(value[name === "id" ? "id" : dbField || name]);
        });

        f[path] = (value: any) => {
          if (hidden.has(value.id)) {
            return false;
          }

          let matched = true;
          if (matchedLabelTags.size) {
            matched =
              value.tags && value.tags.some((tag) => matchedLabelTags.has(tag));
          }

          return matched && fs.every((filter) => filter(value));
        };
      } else {
        f[path] = get(primitiveFilter({ modal, path }));
      }

      return f;
    }, {});

    return (path, value) => {
      if (!filters[path]) {
        return false;
      }

      return filters[path](value);
    };
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});
