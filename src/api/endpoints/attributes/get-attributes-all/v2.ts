/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";

const version = "v2";

export const getAttributesAllV2Options: RouteOptions = {
  description: "Get all attributes in a collection",
  tags: ["api", "Attributes"],
  plugins: {
    "hapi-swagger": {
      order: 2,
    },
  },
  validate: {
    params: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
  },
  response: {
    schema: Joi.object({
      attributes: Joi.array().items(
        Joi.object({
          key: Joi.string().required(),
          attributeCount: Joi.number(),
          kind: Joi.string().valid("string", "number", "date", "range").required(),
          minRange: Joi.number().allow(null),
          maxRange: Joi.number().allow(null),
          values: Joi.array().items(
            Joi.object({
              value: Joi.string().required(),
              count: Joi.number(),
            })
          ),
        })
      ),
    }).label(`getAttributesAll${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-attributes-all-${version}-handler`, `Wrong response schema: ${error}`);

      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;

    try {
      const baseQuery = `
        SELECT key, kind, rank, attribute_count, array_agg(info) AS "values"
        FROM attribute_keys
        WHERE collection_id = $/collection/
        AND kind = 'number'
        GROUP BY id
        
        UNION
        
        SELECT attribute_keys.key, attribute_keys.kind, rank, attribute_count,
           array_agg(jsonb_build_object('value', attributes.value, 'count', attributes.token_count)) AS "values"
        FROM attribute_keys
        JOIN attributes ON attribute_keys.id = attributes.attribute_key_id
        WHERE attribute_keys.collection_id = $/collection/
        AND attribute_keys.kind = 'string'
        GROUP BY attribute_keys.id
        ORDER BY rank DESC
      `;

      const result = await redb.manyOrNone(baseQuery, params).then((result) => {
        return result.map((r) => {
          if (r.kind == "number") {
            return {
              key: r.key,
              kind: r.kind,
              minRange: _.isArray(r.values)
                ? Number((_.first(r.values) as any)["min_range"])
                : null,
              maxRange: _.isArray(r.values)
                ? Number((_.first(r.values) as any)["max_range"])
                : null,
            };
          } else {
            return {
              key: r.key,
              attributeCount: Number(r.attribute_count),
              kind: r.kind,
              values: r.values,
            };
          }
        });
      });

      return { attributes: result };
    } catch (error) {
      logger.error(`get-attributes-all-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
