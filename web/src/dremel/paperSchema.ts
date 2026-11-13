import { ColumnDescriptor } from "./schema";
import { JsonObject } from "./shred";
import { mkDesc } from "./testUtils";

/**
 * Modified schema and records from Figure 2 of the Dremel paper.
 */
export class PaperSchema {
  docId: ColumnDescriptor;
  linksBackward: ColumnDescriptor;
  linksForward: ColumnDescriptor;
  nameLanguageCode: ColumnDescriptor;
  nameLanguageCountry: ColumnDescriptor;
  nameUrl: ColumnDescriptor;
  root: ColumnDescriptor;
  records: JsonObject[];

  constructor() {
    this.docId = mkDesc("DocId", 0, 1);
    this.linksBackward = mkDesc("Backward", 1, 2, { isRepeated: true });
    this.linksForward = mkDesc("Forward", 1, 2, { isRepeated: true });
    this.nameLanguageCode = mkDesc("Code", 2, 3);
    this.nameLanguageCountry = mkDesc("Country", 2, 3);
    this.nameUrl = mkDesc("Url", 1, 2);

    const links = mkDesc("Links", 0, 1, {
      children: [this.linksBackward, this.linksForward],
    });
    const nameLanguage = mkDesc("Language", 2, 2, {
      isRepeated: true,
      children: [this.nameLanguageCode, this.nameLanguageCountry],
    });
    const name = mkDesc("Name", 1, 1, {
      isRepeated: true,
      children: [nameLanguage, this.nameUrl],
    });

    this.root = mkDesc("$", 0, 0, { children: [this.docId, links, name] });

    this.records = [
      {
        DocId: 10,
        Links: { Forward: [20, 40, 60] },
        Name: [
          {
            Language: [
              { Code: "en-us", Country: "us" },
              { Code: "en" },
            ],
            Url: "http://A",
          },
          { Url: "http://B" },
          { Language: [{ Code: "en-gb", Country: "gb" }] },
        ],
      },
      {
        DocId: 20,
        Links: { Backward: [10, 30], Forward: [80] },
        Name: [{ Url: "http://C" }],
      },
    ];
  }
}
