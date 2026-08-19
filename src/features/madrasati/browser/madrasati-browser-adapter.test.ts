import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  BrowserAutomation,
  BrowserPageHandle,
  BrowserSessionHandle,
  BrowserSessionOpenOptions,
} from "./browser-automation.ts";
import { MadrasatiBrowserAdapter } from "./madrasati-browser-adapter.server.ts";
import { PlaywrightBrowserAutomation } from "./playwright-browser-automation.server.ts";
import type {
  MadrasatiFocusedControl,
  MadrasatiLiveFrame,
} from "./madrasati-browser-live-session.ts";

class FakeBrowserAutomation implements BrowserAutomation {
  readonly kind = "playwright" as const;

  private sessionOpen = false;
  private pageOpen = false;

  async assertAvailable(): Promise<void> {}

  async openSession(
    _options?: BrowserSessionOpenOptions,
  ): Promise<BrowserSessionHandle> {
    this.sessionOpen = true;
    return Object.freeze({ id: "test-session" });
  }

  async closeSession(_session: BrowserSessionHandle): Promise<void> {
    this.sessionOpen = false;
  }

  async openPage(
    _session: BrowserSessionHandle,
  ): Promise<BrowserPageHandle> {
    assert.equal(this.sessionOpen, true);
    this.pageOpen = true;
    return Object.freeze({ id: "test-page" });
  }

  async closePage(_page: BrowserPageHandle): Promise<void> {
    this.pageOpen = false;
  }

  async goto(
    _page: BrowserPageHandle,
    url: string,
  ): Promise<void> {
    assert.equal(this.pageOpen, true);
    assert.match(url, /^https:\/\/schools\.madrasati\.sa\//);
  }

  async getPageUrl(_page: BrowserPageHandle): Promise<string> {
    return "https://schools.madrasati.sa/";
  }

  async getPageTitle(_page: BrowserPageHandle): Promise<string> {
    return "مدرستي";
  }

  async getPageText(_page: BrowserPageHandle): Promise<string> {
    return "مدرستي";
  }

  async getPageScreenshot(_page: BrowserPageHandle): Promise<Uint8Array> {
    return new Uint8Array([137, 80, 78, 71]);
  }

  async clickPage(
    _page: BrowserPageHandle,
    _x: number,
    _y: number,
  ): Promise<void> {}

  async typePage(
    _page: BrowserPageHandle,
    _text: string,
  ): Promise<void> {}

  async pressPageKey(
    _page: BrowserPageHandle,
    _key: string,
  ): Promise<void> {}

  async focusEditableControl(_page: BrowserPageHandle): Promise<void> {}

  async startPageLiveView(_page: BrowserPageHandle): Promise<void> {}

  async stopPageLiveView(_page: BrowserPageHandle): Promise<void> {}

  async getPageLiveFrame(_page: BrowserPageHandle): Promise<MadrasatiLiveFrame> {
    return {
      mimeType: "image/jpeg",
      base64: "AAAA",
      viewportWidth: 390,
      viewportHeight: 844,
    };
  }

  async inspectFocusedControl(
    _page: BrowserPageHandle,
  ): Promise<MadrasatiFocusedControl> {
    return { isEditable: false, inputType: "none" };
  }

  async readPageLandmarks(_page: BrowserPageHandle) {
    return {
      url: await this.getPageUrl(_page),
      title: await this.getPageTitle(_page),
      text: await this.getPageText(_page),
      accessibleNames: [] as string[],
      labeledValues: [] as Array<{ label: string; value: string }>,
      tableRows: [] as Array<{ headers: string[]; cells: string[] }>,
    };
  }

  async clickControlByAccessibleName(
    _page: BrowserPageHandle,
    _names: readonly string[],
  ): Promise<boolean> {
    return false;
  }

  async waitForPageText(
    _page: BrowserPageHandle,
    _needle: string,
    _timeoutMs?: number,
  ): Promise<boolean> {
    return false;
  }

  subscribePageLiveFrame(
    _page: BrowserPageHandle,
    _listener: (frame: MadrasatiLiveFrame) => void,
  ): () => void {
    return () => undefined;
  }
}

test("MadrasatiBrowserAdapter — reports browser availability without opening a session", async () => {
  const automation = new FakeBrowserAutomation();
  const provider = new MadrasatiBrowserAdapter(automation);

  const statusBefore = await provider.getConnectionStatus();

  assert.equal(statusBefore.state, "not_implemented");
  assert.equal(statusBefore.browserAutomationAvailable, true);
  assert.equal(statusBefore.isMock, false);
});

test("MadrasatiBrowserAdapter — connect opens Madrasati session", async () => {
  const automation = new FakeBrowserAutomation();
  const provider = new MadrasatiBrowserAdapter(automation);

  const status = await provider.connect();

  assert.equal(status.state, "connected");
  assert.equal(status.browserAutomationAvailable, true);
  assert.equal(status.isMock, false);
  assert.match(
    status.message,
    /تم فتح جلسة متصفح الخادم/,
  );
});

test("MadrasatiBrowserAdapter — disconnect closes the browser session", async () => {
  const automation = new FakeBrowserAutomation();
  const provider = new MadrasatiBrowserAdapter(automation);

  const connected = await provider.connect();
  assert.equal(connected.state, "connected");

  const disconnected = await provider.disconnect();

  assert.equal(disconnected.state, "disconnected");
  assert.equal(disconnected.browserAutomationAvailable, true);
  assert.equal(disconnected.isMock, false);
});

test("MadrasatiBrowserAdapter — beginAuthentication exposes sanitized live frame and focus", async () => {
  const automation = new FakeBrowserAutomation();
  const provider = new MadrasatiBrowserAdapter(automation);

  await provider.connect();
  const status = await provider.beginAuthentication();

  assert.equal(status.state, "connected");
  assert.equal(status.isMock, false);

  const frame = await provider.getAuthenticationLiveFrame();
  assert.equal(frame.mimeType, "image/jpeg");
  assert.equal("cookies" in frame, false);

  const focus = await provider.inspectAuthenticationFocus();
  assert.deepEqual(Object.keys(focus).sort(), ["inputType", "isEditable"]);
});

test("MadrasatiBrowserAdapter — reads teacher profile from authenticated home landmarks", async () => {
  class TeacherHomeAutomation extends FakeBrowserAutomation {
    async getPageText(): Promise<string> {
      return "مرحباً، معلم الاختبار\nجدولي\nالمقررات والمصادر\nالواجبات";
    }

    async readPageLandmarks() {
      return {
        url: "https://schools.madrasati.sa/",
        title: "مدرستي",
        text: await this.getPageText(),
        accessibleNames: ["جدولي", "المقررات والمصادر", "تسجيل الخروج"],
        labeledValues: [
          { label: "المدرسة", value: "مدرسة الاختبار الأهلية" },
          { label: "العام الدراسي", value: "1447" },
          { label: "الفصل الدراسي", value: "الأول" },
        ],
        tableRows: [],
      };
    }
  }

  const provider = new MadrasatiBrowserAdapter(new TeacherHomeAutomation());
  await provider.connect();

  const teacher = await provider.getTeacherProfile();
  assert.equal(teacher.displayName, "معلم الاختبار");
  assert.equal(teacher.schoolName, "مدرسة الاختبار الأهلية");
  assert.equal(teacher.academicYear, "1447");
  assert.equal(teacher.semester, "1");

  await assert.rejects(
    () => provider.getTimetable(),
    /تعذر قراءة الجدول/,
  );
  const after = await provider.getTeacherProfile();
  assert.equal(after.displayName, "معلم الاختبار");
});

test("MadrasatiBrowserAdapter — navigates to مقرراتي and returns normalized classes", async () => {
  class ClassCatalogAutomation extends FakeBrowserAutomation {
    view: "home" | "courses" = "home";
    clicked: string[] = [];
    sessionClosed = false;

    async closeSession(): Promise<void> {
      this.sessionClosed = true;
    }

    async getPageText(): Promise<string> {
      if (this.view === "courses") {
        return "مقرراتي\nالصف\nالشعبة\nالصف الأول المتوسط\n1\nالصف الأول المتوسط\n2";
      }

      return "مرحباً، معلم الاختبار\nجدولي\nالمقررات والمصادر\nالواجبات\nتسجيل الخروج";
    }

    async readPageLandmarks() {
      if (this.view === "courses") {
        return {
          url: "https://schools.madrasati.sa/Courses",
          title: "مقرراتي",
          text: await this.getPageText(),
          accessibleNames: ["مقرراتي", "الرئيسية"],
          labeledValues: [],
          tableRows: [
            {
              headers: ["المقرر", "الصف", "الشعبة"],
              cells: ["الرياضيات", "الصف الأول المتوسط", "1"],
            },
            {
              headers: ["المقرر", "الصف", "الشعبة"],
              cells: ["العلوم", "الصف الأول المتوسط", "2"],
            },
          ],
        };
      }

      return {
        url: "https://schools.madrasati.sa/",
        title: "مدرستي",
        text: await this.getPageText(),
        accessibleNames: ["جدولي", "المقررات والمصادر", "مقرراتي", "الرئيسية"],
        labeledValues: [],
        tableRows: [],
      };
    }

    async clickControlByAccessibleName(
      _page: BrowserPageHandle,
      names: readonly string[],
    ): Promise<boolean> {
      this.clicked.push(names[0] ?? "");

      if (names.some((name) => name === "مقرراتي" || name === "المقررات والمصادر")) {
        this.view = "courses";
        return true;
      }

      if (names.some((name) => name === "الرئيسية" || name === "الصفحة الرئيسية")) {
        this.view = "home";
        return true;
      }

      return false;
    }

    async waitForPageText(
      _page: BrowserPageHandle,
      needle: string,
    ): Promise<boolean> {
      return (await this.getPageText()).includes(needle);
    }
  }

  const automation = new ClassCatalogAutomation();
  const provider = new MadrasatiBrowserAdapter(automation);
  await provider.connect();

  const classes = await provider.getClasses();

  assert.deepEqual(classes, [
    { grade: "الصف الأول المتوسط", className: "1", stage: "intermediate" },
    { grade: "الصف الأول المتوسط", className: "2", stage: "intermediate" },
  ]);
  assert.equal(automation.view, "home");
  assert.equal(automation.sessionClosed, false);
  assert.ok(automation.clicked.includes("المقررات والمصادر"));
  assert.ok(automation.clicked.includes("مقرراتي"));
  assert.ok(automation.clicked.includes("الرئيسية"));

  const teacher = await provider.getTeacherProfile();
  assert.equal(teacher.displayName, "معلم الاختبار");

  const subjects = await provider.getSubjects();
  assert.deepEqual(subjects, [{ name: "الرياضيات" }, { name: "العلوم" }]);
  assert.equal(automation.view, "home");
  assert.equal(automation.sessionClosed, false);

  await assert.rejects(() => provider.getTimetable(), /تعذر قراءة الجدول/);
  assert.equal(automation.view, "home");
  assert.equal(automation.sessionClosed, false);
});

test("MadrasatiBrowserAdapter — getClasses fails closed when unauthenticated or unreadable", async () => {
  const unauthenticated = new MadrasatiBrowserAdapter(new FakeBrowserAutomation());
  await unauthenticated.connect();
  await assert.rejects(() => unauthenticated.getClasses(), /قبل اكتمال تسجيل الدخول/);

  class UnreadableCatalogAutomation extends FakeBrowserAutomation {
    async getPageText(): Promise<string> {
      return "مرحباً، معلم الاختبار\nجدولي\nالمقررات والمصادر\nالواجبات\nتسجيل الخروج";
    }

    async waitForPageText(): Promise<boolean> {
      return true;
    }
  }

  const unreadable = new MadrasatiBrowserAdapter(new UnreadableCatalogAutomation());
  await unreadable.connect();
  await assert.rejects(() => unreadable.getClasses(), /تعذر قراءة الفصول/);
});

test("MadrasatiBrowserAdapter — confirmed empty مقرراتي list is not a fake success with mock classes", async () => {
  class EmptyCatalogAutomation extends FakeBrowserAutomation {
    view: "home" | "courses" = "home";

    async getPageText(): Promise<string> {
      return this.view === "courses"
        ? "مقرراتي\nلا توجد مقررات مسندة"
        : "مرحباً، معلم الاختبار\nجدولي\nالمقررات والمصادر\nالواجبات\nتسجيل الخروج";
    }

    async readPageLandmarks() {
      return {
        url:
          this.view === "courses"
            ? "https://schools.madrasati.sa/Courses"
            : "https://schools.madrasati.sa/",
        title: this.view === "courses" ? "مقرراتي" : "مدرستي",
        text: await this.getPageText(),
        accessibleNames: ["مقرراتي", "المقررات والمصادر", "الرئيسية"],
        labeledValues: [],
        tableRows: [],
      };
    }

    async clickControlByAccessibleName(
      _page: BrowserPageHandle,
      names: readonly string[],
    ): Promise<boolean> {
      if (names.some((name) => name === "مقرراتي" || name === "المقررات والمصادر")) {
        this.view = "courses";
        return true;
      }
      if (names.some((name) => name === "الرئيسية")) {
        this.view = "home";
        return true;
      }
      return false;
    }

    async waitForPageText(
      _page: BrowserPageHandle,
      needle: string,
    ): Promise<boolean> {
      return (await this.getPageText()).includes(needle);
    }
  }

  const provider = new MadrasatiBrowserAdapter(new EmptyCatalogAutomation());
  await provider.connect();
  const classes = await provider.getClasses();
  assert.deepEqual(classes, []);
  const subjects = await provider.getSubjects();
  assert.deepEqual(subjects, []);
});

test("MadrasatiBrowserAdapter — getSubjects fails closed when unauthenticated or unreadable", async () => {
  const unauthenticated = new MadrasatiBrowserAdapter(new FakeBrowserAutomation());
  await unauthenticated.connect();
  await assert.rejects(() => unauthenticated.getSubjects(), /قبل اكتمال تسجيل الدخول/);

  class GradeOnlyCatalogAutomation extends FakeBrowserAutomation {
    view: "home" | "courses" = "home";
    sessionClosed = false;

    async closeSession(): Promise<void> {
      this.sessionClosed = true;
    }

    async getPageText(): Promise<string> {
      return this.view === "courses"
        ? "مقرراتي\nالصف\nالشعبة\nالصف الأول المتوسط\n1"
        : "مرحباً، معلم الاختبار\nجدولي\nالمقررات والمصادر\nالواجبات\nتسجيل الخروج";
    }

    async readPageLandmarks() {
      return {
        url:
          this.view === "courses"
            ? "https://schools.madrasati.sa/Courses"
            : "https://schools.madrasati.sa/",
        title: this.view === "courses" ? "مقرراتي" : "مدرستي",
        text: await this.getPageText(),
        accessibleNames: ["مقرراتي", "المقررات والمصادر", "الرئيسية"],
        labeledValues: [],
        tableRows:
          this.view === "courses"
            ? [
                {
                  headers: ["الصف", "الشعبة"],
                  cells: ["الصف الأول المتوسط", "1"],
                },
              ]
            : [],
      };
    }

    async clickControlByAccessibleName(
      _page: BrowserPageHandle,
      names: readonly string[],
    ): Promise<boolean> {
      if (names.some((name) => name === "مقرراتي" || name === "المقررات والمصادر")) {
        this.view = "courses";
        return true;
      }
      if (names.some((name) => name === "الرئيسية")) {
        this.view = "home";
        return true;
      }
      return false;
    }

    async waitForPageText(
      _page: BrowserPageHandle,
      needle: string,
    ): Promise<boolean> {
      return (await this.getPageText()).includes(needle);
    }
  }

  const automation = new GradeOnlyCatalogAutomation();
  const unreadable = new MadrasatiBrowserAdapter(automation);
  await unreadable.connect();
  await assert.rejects(() => unreadable.getSubjects(), /تعذر قراءة المواد/);
  assert.equal(automation.view, "home");
  assert.equal(automation.sessionClosed, false);
});

test("MadrasatiBrowserAdapter — navigates to جدولي and returns normalized timetable entries", async () => {
  class TimetableAutomation extends FakeBrowserAutomation {
    view: "home" | "timetable" = "home";
    clicked: string[] = [];
    sessionClosed = false;
    pageClosed = false;

    async closeSession(): Promise<void> {
      this.sessionClosed = true;
    }

    async closePage(): Promise<void> {
      this.pageClosed = true;
    }

    async getPageText(): Promise<string> {
      if (this.view === "timetable") {
        return "جدولي\nالأحد\nالحصة\nالرياضيات";
      }

      return "مرحباً، معلم الاختبار\nجدولي\nالمقررات والمصادر\nالواجبات\nتسجيل الخروج";
    }

    async readPageLandmarks() {
      if (this.view === "timetable") {
        return {
          url: "https://schools.madrasati.sa/Timetable",
          title: "جدولي",
          text: await this.getPageText(),
          accessibleNames: ["جدولي", "الرئيسية"],
          labeledValues: [] as Array<{ label: string; value: string }>,
          tableRows: [
            {
              headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة", "قاعة"],
              cells: ["الأحد", "الحصة الأولى", "الرياضيات", "الصف الأول المتوسط", "1", "أ-101"],
            },
            {
              headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة", "قاعة"],
              cells: ["الاثنين", "2", "العلوم", "الصف الأول المتوسط", "2", "أ-101"],
            },
          ],
        };
      }

      return {
        url: "https://schools.madrasati.sa/",
        title: "مدرستي",
        text: await this.getPageText(),
        accessibleNames: ["جدولي", "المقررات والمصادر", "الرئيسية"],
        labeledValues: [],
        tableRows: [],
      };
    }

    async clickControlByAccessibleName(
      _page: BrowserPageHandle,
      names: readonly string[],
    ): Promise<boolean> {
      this.clicked.push(names[0] ?? "");

      if (names.some((name) => name === "جدولي" || name === "الجدول")) {
        this.view = "timetable";
        return true;
      }

      if (names.some((name) => name === "الرئيسية" || name === "الصفحة الرئيسية")) {
        this.view = "home";
        return true;
      }

      return false;
    }

    async waitForPageText(
      _page: BrowserPageHandle,
      needle: string,
    ): Promise<boolean> {
      return (await this.getPageText()).includes(needle);
    }
  }

  const automation = new TimetableAutomation();
  const provider = new MadrasatiBrowserAdapter(automation);
  await provider.connect();

  const timetable = await provider.getTimetable();

  assert.equal(timetable.length, 2);
  assert.equal(timetable[0]?.dayOfWeek, 0);
  assert.equal(timetable[0]?.period, 1);
  assert.equal(timetable[0]?.subject, "الرياضيات");
  assert.equal(timetable[0]?.grade, "الصف الأول المتوسط");
  assert.equal(timetable[0]?.className, "1");
  assert.equal(timetable[0]?.classroom, "أ-101");
  assert.equal(timetable[1]?.dayOfWeek, 1);
  assert.equal(timetable[1]?.subject, "العلوم");
  assert.equal(automation.view, "home");
  assert.equal(automation.sessionClosed, false);
  assert.equal(automation.pageClosed, false);
  assert.ok(automation.clicked.includes("جدولي"));
  assert.ok(automation.clicked.includes("الرئيسية"));

  const teacher = await provider.getTeacherProfile();
  assert.equal(teacher.displayName, "معلم الاختبار");
});

test("MadrasatiBrowserAdapter — already on جدولي does not navigate again", async () => {
  class AlreadyOnTimetableAutomation extends FakeBrowserAutomation {
    clicked: string[] = [];

    async getPageText(): Promise<string> {
      return "جدولي\nالأحد\nالحصة الأولى\nالرياضيات\nتسجيل الخروج\nالمقررات";
    }

    async readPageLandmarks() {
      return {
        url: "https://schools.madrasati.sa/Timetable",
        title: "جدولي",
        text: await this.getPageText(),
        accessibleNames: ["جدولي", "الرئيسية"],
        labeledValues: [] as Array<{ label: string; value: string }>,
        tableRows: [
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الأحد", "1", "الرياضيات", "الصف الأول المتوسط", "1"],
          },
        ],
      };
    }

    async clickControlByAccessibleName(
      _page: BrowserPageHandle,
      names: readonly string[],
    ): Promise<boolean> {
      this.clicked.push(names[0] ?? "");
      return true;
    }
  }

  const automation = new AlreadyOnTimetableAutomation();
  const provider = new MadrasatiBrowserAdapter(automation);
  await provider.connect();

  const timetable = await provider.getTimetable();
  assert.equal(timetable.length, 1);
  assert.equal(timetable[0]?.subject, "الرياضيات");
  assert.deepEqual(automation.clicked, []);
});

test("MadrasatiBrowserAdapter — getTimetable fails closed when unauthenticated or unreadable", async () => {
  const unauthenticated = new MadrasatiBrowserAdapter(new FakeBrowserAutomation());
  await unauthenticated.connect();
  await assert.rejects(() => unauthenticated.getTimetable(), /قبل اكتمال تسجيل الدخول/);

  class UnreadableTimetableAutomation extends FakeBrowserAutomation {
    view: "home" | "timetable" = "home";
    sessionClosed = false;

    async closeSession(): Promise<void> {
      this.sessionClosed = true;
    }

    async getPageText(): Promise<string> {
      return this.view === "timetable"
        ? "جدولي"
        : "مرحباً، معلم الاختبار\nجدولي\nالمقررات والمصادر\nالواجبات\nتسجيل الخروج";
    }

    async readPageLandmarks() {
      return {
        url:
          this.view === "timetable"
            ? "https://schools.madrasati.sa/Timetable"
            : "https://schools.madrasati.sa/",
        title: this.view === "timetable" ? "جدولي" : "مدرستي",
        text: await this.getPageText(),
        accessibleNames: ["جدولي", "المقررات والمصادر", "الرئيسية"],
        labeledValues: [] as Array<{ label: string; value: string }>,
        tableRows: [],
      };
    }

    async clickControlByAccessibleName(
      _page: BrowserPageHandle,
      names: readonly string[],
    ): Promise<boolean> {
      if (names.some((name) => name === "جدولي" || name === "الجدول")) {
        this.view = "timetable";
        return true;
      }
      if (names.some((name) => name === "الرئيسية")) {
        this.view = "home";
        return true;
      }
      return false;
    }

    async waitForPageText(): Promise<boolean> {
      return true;
    }
  }

  const automation = new UnreadableTimetableAutomation();
  const unreadable = new MadrasatiBrowserAdapter(automation);
  await unreadable.connect();
  await assert.rejects(() => unreadable.getTimetable(), /تعذر قراءة الجدول/);
  assert.equal(automation.view, "home");
  assert.equal(automation.sessionClosed, false);
});

test("MadrasatiBrowserAdapter — confirmed empty جدولي is not a fake success with invented lessons", async () => {
  class EmptyTimetableAutomation extends FakeBrowserAutomation {
    view: "home" | "timetable" = "home";

    async getPageText(): Promise<string> {
      return this.view === "timetable"
        ? "جدولي\nلا توجد حصص"
        : "مرحباً، معلم الاختبار\nجدولي\nالمقررات والمصادر\nالواجبات\nتسجيل الخروج";
    }

    async readPageLandmarks() {
      return {
        url:
          this.view === "timetable"
            ? "https://schools.madrasati.sa/Timetable"
            : "https://schools.madrasati.sa/",
        title: this.view === "timetable" ? "جدولي" : "مدرستي",
        text: await this.getPageText(),
        accessibleNames: ["جدولي", "الرئيسية"],
        labeledValues: [] as Array<{ label: string; value: string }>,
        tableRows: [],
      };
    }

    async clickControlByAccessibleName(
      _page: BrowserPageHandle,
      names: readonly string[],
    ): Promise<boolean> {
      if (names.some((name) => name === "جدولي" || name === "الجدول")) {
        this.view = "timetable";
        return true;
      }
      if (names.some((name) => name === "الرئيسية")) {
        this.view = "home";
        return true;
      }
      return false;
    }

    async waitForPageText(
      _page: BrowserPageHandle,
      needle: string,
    ): Promise<boolean> {
      return (await this.getPageText()).includes(needle);
    }
  }

  const provider = new MadrasatiBrowserAdapter(new EmptyTimetableAutomation());
  await provider.connect();
  const timetable = await provider.getTimetable();
  assert.deepEqual(timetable, []);
});

test("MadrasatiBrowserAdapter — focuses the email field, types once, and submits Next once", async () => {
  class EmailNextAutomation extends FakeBrowserAutomation {
    readonly sequence: string[] = [];
    typedText = "";
    nextNames: string[] = [];
    enterKeys = 0;

    async getPageUrl(): Promise<string> {
      return "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
    }

    async getPageTitle(): Promise<string> {
      return "Sign in to your account";
    }

    async getPageText(): Promise<string> {
      return "Sign in\nNext";
    }

    async focusEditableControl(): Promise<void> {
      this.sequence.push("focus");
    }

    async typePage(_page: BrowserPageHandle, text: string): Promise<void> {
      this.typedText += text;
      this.sequence.push("type");
    }

    async clickControlByAccessibleName(
      _page: BrowserPageHandle,
      names: readonly string[],
    ): Promise<boolean> {
      this.nextNames = [...names];
      this.sequence.push("next");
      return names.includes("Next");
    }

    async pressPageKey(_page: BrowserPageHandle, key: string): Promise<void> {
      if (key === "Enter") {
        this.enterKeys += 1;
      }
      this.sequence.push(`key:${key}`);
    }
  }

  const automation = new EmailNextAutomation();
  const provider = new MadrasatiBrowserAdapter(automation);

  const connected = await provider.connect();
  assert.equal(connected.state, "connected");

  await provider.beginAuthentication();
  await provider.typeAuthentication("teacher@example.com");
  const page = await provider.submitAuthenticationEmail();

  assert.deepEqual(automation.sequence.slice(0, 2), ["focus", "type"]);
  assert.equal(automation.typedText, "teacher@example.com");
  assert.equal(automation.sequence.filter((step) => step === "next").length, 1);
  assert.equal(automation.enterKeys, 0);
  assert.equal(
    automation.sequence.filter((step) => step.startsWith("key:")).length,
    0,
  );
  assert.ok(automation.nextNames.includes("Next"));
  assert.ok(automation.nextNames.includes("التالي"));
  assert.equal(page.authenticationState, "not_authenticated");
  assert.match(page.url, /login\.microsoftonline\.com/);
  assert.equal("cookies" in page, false);
  assert.equal("page" in page, false);
  assert.equal("locator" in page, false);
  assert.equal("context" in page, false);
  assert.equal("playwright" in page, false);
  assert.deepEqual(Object.keys(page).sort(), [
    "authenticationState",
    "text",
    "title",
    "url",
  ]);
});

test("MadrasatiBrowserAdapter — Enter is sent exactly once when Next is not available", async () => {
  class EnterFallbackAutomation extends FakeBrowserAutomation {
    nextAttempts = 0;
    enterKeys = 0;

    async focusEditableControl(): Promise<void> {}

    async clickControlByAccessibleName(): Promise<boolean> {
      this.nextAttempts += 1;
      return false;
    }

    async pressPageKey(_page: BrowserPageHandle, key: string): Promise<void> {
      if (key === "Enter") {
        this.enterKeys += 1;
      }
    }
  }

  const automation = new EnterFallbackAutomation();
  const provider = new MadrasatiBrowserAdapter(automation);

  await provider.connect();
  await provider.submitAuthenticationEmail();

  assert.equal(automation.nextAttempts, 1);
  assert.equal(automation.enterKeys, 1);
});

test("Playwright boundary — page lifecycle through opaque handles", async () => {
  const automation = new PlaywrightBrowserAutomation();

  const session = await automation.openSession();
  const page = await automation.openPage(session);

  assert.equal(Object.keys(session).length, 1);
  assert.equal(Object.keys(page).length, 1);

  assert.equal(typeof session.id, "string");
  assert.equal(typeof page.id, "string");

  await automation.goto(page, "https://example.com", {
    waitUntil: "domcontentloaded",
  });

  assert.equal(
    await automation.getPageTitle(page),
    "Example Domain",
  );

  assert.equal(
    await automation.getPageUrl(page),
    "https://example.com/",
  );

  await automation.closePage(page);
  await automation.closeSession(session);
  await automation.close();
});
