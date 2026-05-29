import { relations } from "drizzle-orm/relations";
import { items, rentalRecords, generalUsers, visitSessions } from "./schema";

export const rentalRecordsRelations = relations(rentalRecords, ({ one }) => ({
  item: one(items, {
    fields: [rentalRecords.itemsId],
    references: [items.id],
  }),
  generalUser: one(generalUsers, {
    fields: [rentalRecords.userId],
    references: [generalUsers.id],
  }),
  visitSession: one(visitSessions, {
    fields: [rentalRecords.visitSessionId],
    references: [visitSessions.id],
  }),
}));

export const itemsRelations = relations(items, ({ many }) => ({
  rentalRecords: many(rentalRecords),
}));

export const generalUsersRelations = relations(generalUsers, ({ many }) => ({
  rentalRecords: many(rentalRecords),
  visitSessions: many(visitSessions),
}));

export const visitSessionsRelations = relations(
  visitSessions,
  ({ one, many }) => ({
    generalUser: one(generalUsers, {
      fields: [visitSessions.generalUserId],
      references: [generalUsers.id],
    }),
    rentalRecords: many(rentalRecords),
  })
);
