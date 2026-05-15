import { describe, it, expect } from "vitest";
import {
  parseFeed,
  withinHours,
  dedupe,
  type FeedItem,
} from "../src/lib/feeds";

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Yahoo</title>
  <item>
    <title>Rocket Lab wins &amp; signs $2.2B deal</title>
    <link>https://example.com/a?utm=x#frag</link>
    <description><![CDATA[<p>Big <b>news</b> &amp; more</p>]]></description>
    <pubDate>Wed, 14 May 2026 13:20:00 GMT</pubDate>
  </item>
  <item>
    <title>Old story</title>
    <link></link>
    <guid isPermaLink="true">https://example.com/old</guid>
    <description>plain &lt;text&gt;</description>
    <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>EDGAR</title>
  <entry>
    <title>8-K - ROCKET LAB</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/abc"/>
    <summary type="html">Filing &amp; details</summary>
    <updated>2026-05-14T12:00:00-04:00</updated>
  </entry>
</feed>`;

describe("parseFeed — RSS 2.0", () => {
  const items = parseFeed(RSS, "Yahoo Finance");

  it("아이템 수·소스 라벨", () => {
    expect(items.length).toBe(2);
    expect(items.every((i) => i.source === "Yahoo Finance")).toBe(true);
  });

  it("title 엔티티 디코드", () => {
    expect(items[0].title).toBe("Rocket Lab wins & signs $2.2B deal");
  });

  it("CDATA + HTML + 엔티티 → 평문 summary", () => {
    expect(items[0].summary).toBe("Big news & more");
    expect(items[1].summary).toBe("plain <text>");
  });

  it("pubDate(RFC822) → ISO", () => {
    expect(items[0].published).toBe("2026-05-14T13:20:00.000Z");
  });

  it("link 비었으면 URL 형태 guid로 대체", () => {
    expect(items[0].link).toBe("https://example.com/a?utm=x#frag");
    expect(items[1].link).toBe("https://example.com/old");
  });
});

describe("parseFeed — Atom", () => {
  const items = parseFeed(ATOM, "SEC EDGAR");

  it("entry 파싱 + rel=alternate href 링크", () => {
    expect(items.length).toBe(1);
    expect(items[0].title).toBe("8-K - ROCKET LAB");
    expect(items[0].link).toBe("https://www.sec.gov/abc");
    expect(items[0].summary).toBe("Filing & details");
  });

  it("updated(타임존 오프셋) → UTC ISO", () => {
    expect(items[0].published).toBe("2026-05-14T16:00:00.000Z");
  });

  it("빈 입력 → []", () => {
    expect(parseFeed("", "X")).toEqual([]);
    expect(parseFeed("<rss><channel></channel></rss>", "X")).toEqual([]);
  });
});

describe("withinHours", () => {
  const now = Date.parse("2026-05-14T20:00:00.000Z");
  const at = (iso: string | null): FeedItem => ({
    title: "t",
    link: "l",
    published: iso,
    source: "s",
    summary: "",
  });

  it("24h 이내 true, 그 이전 false", () => {
    expect(withinHours(at("2026-05-14T13:20:00.000Z"), 24, now)).toBe(true);
    expect(withinHours(at("2024-01-01T00:00:00.000Z"), 24, now)).toBe(false);
  });

  it("published 없으면 false", () => {
    expect(withinHours(at(null), 24, now)).toBe(false);
  });

  it("미세한 미래(시계 오차)는 허용, 큰 미래는 제외", () => {
    expect(withinHours(at("2026-05-14T20:30:00.000Z"), 24, now)).toBe(true);
    expect(withinHours(at("2026-05-14T22:00:00.000Z"), 24, now)).toBe(false);
  });
});

describe("dedupe", () => {
  it("link(쿼리·프래그먼트 제거)·정규화 title 기준 중복 제거", () => {
    const mk = (link: string, title: string): FeedItem => ({
      title,
      link,
      published: null,
      source: "s",
      summary: "",
    });
    const out = dedupe([
      mk("https://x.com/1?a=b", "A"),
      mk("https://x.com/1#frag", "A dup by link"),
      mk("", "Same Title"),
      mk("", "same title"),
      mk("https://x.com/2", "E"),
    ]);
    expect(out.map((i) => i.title)).toEqual(["A", "Same Title", "E"]);
  });
});
