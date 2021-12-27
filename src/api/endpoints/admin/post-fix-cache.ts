import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";

export const postFixCacheOptions: RouteOptions = {
  description: "Trigger fixing any cache inconsistencies",
  tags: ["api"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      kind: Joi.string().valid("tokens-floor-sell", "tokens-top-buy"),
      contract: Joi.string().lowercase().required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Unauthorized");
    }

    const payload = request.payload as any;

    try {
      const kind = payload.kind;
      const contract = payload.contract;

      switch (kind) {
        case "tokens-floor-sell": {
          await db.none(
            `
              update "tokens" "t" set
                "floor_sell_hash" = "x"."hash",
                "floor_sell_value" = "x"."value"
              from (
                select distinct on ("t"."contract", "t"."token_id", "o"."value")
                  "t"."contract",
                  "t"."token_id",
                  "o"."value",
                  "o"."hash"
                from "tokens" "t"
                left join "token_sets_tokens" "tst"
                  on "t"."contract" = "tst"."contract"
                  and "t"."token_id" = "tst"."token_id"
                left join "orders" "o"
                  on "tst"."token_set_id" = "o"."token_set_id"
                  and "o"."side" = 'sell'
                  and "o"."status" = 'valid'
                  and "o"."valid_between" @> now()
                where "t"."contract" = $/contract/
                order by "t"."contract", "t"."token_id", "o"."value" asc
              ) "x"
              where "t"."contract" = "x"."contract"
                and "t"."token_id" = "x"."token_id"
            `,
            { contract }
          );

          break;
        }

        case "tokens-top-buy": {
          await db.none(
            `
              update "tokens" "t" set
                "top_buy_hash" = "x"."hash",
                "top_buy_value" = "x"."value"
              from (
                select distinct on ("t"."contract", "t"."token_id", "o"."value")
                  "t"."contract",
                  "t"."token_id",
                  "o"."value",
                  "o"."hash"
                from "tokens" "t"
                left join "token_sets_tokens" "tst"
                  on "t"."contract" = "tst"."contract"
                  and "t"."token_id" = "tst"."token_id"
                left join "orders" "o"
                  on "tst"."token_set_id" = "o"."token_set_id"
                  and "o"."side" = 'buy'
                  and "o"."status" = 'valid'
                  and "o"."valid_between" @> now()
                where "t"."contract" = $/contract/
                order by "t"."contract", "t"."token_id", "o"."value" desc
              ) "x"
              where "t"."contract" = "x"."contract"
                and "t"."token_id" = "x"."token_id"
            `,
            { contract }
          );

          break;
        }
      }

      return { message: "Success" };
    } catch (error) {
      logger.error("post_fix_cache_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
