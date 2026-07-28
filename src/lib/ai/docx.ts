import { toast } from "sonner";

export async function downloadArabicDocx(params: {
  title: string;
  subtitle?: string;
  content: string;
  filename?: string;
}): Promise<void> {
  try {
    const { Document, Packer, Paragraph, TextRun } = await import("docx");
    const bodyParas = params.content.split(/\n/).map(
      (line) =>
        new Paragraph({
          bidirectional: true,
          children: [new TextRun({ text: line, rightToLeft: true })],
        }),
    );
    const children: InstanceType<typeof Paragraph>[] = [
      new Paragraph({
        bidirectional: true,
        children: [new TextRun({ text: params.title, bold: true, size: 32, rightToLeft: true })],
      }),
    ];
    if (params.subtitle) {
      children.push(
        new Paragraph({
          bidirectional: true,
          children: [new TextRun({ text: params.subtitle, size: 24, rightToLeft: true })],
        }),
      );
    }
    children.push(new Paragraph({ children: [] }), ...bodyParas);

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    const safe =
      (params.filename ?? params.title).replace(/[\\/:*?"<>|]+/g, "").slice(0, 80) || "document";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    toast.error("تعذر تنزيل الملف");
  }
}

export interface StructuredLessonPlanData {
  behavioralObjectives: {
    cognitive: string[];
    affective: string[];
    psychomotor: string[];
  };
  strategiesAndDigitalSkills: {
    strategies: string[];
    digitalSkills: string[];
  };
  lessonScenario: {
    introduction: string;
    exercises: string[];
    deliveryScript: string;
  };
  assessmentAndHomework: {
    homework: string;
    summativeAssessment: string[];
  };
}

export async function downloadStructuredLessonPrepDocx(params: {
  title: string;
  subject: string;
  grade: string;
  duration?: string;
  unit?: string;
  data: StructuredLessonPlanData;
  filename?: string;
}): Promise<void> {
  try {
    const {
      Document,
      Packer,
      Paragraph,
      TextRun,
      Table,
      TableRow,
      TableCell,
      HeadingLevel,
      BorderStyle,
      WidthType,
      AlignmentType,
    } = await import("docx");

    const rightToLeft = true;

    // Table Header Cell helper
    const createHeaderCell = (text: string, widthPercent: number) => {
      return new TableCell({
        children: [
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text,
                bold: true,
                color: "FFFFFF",
                size: 24,
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
        ],
        width: { size: widthPercent, type: WidthType.PERCENTAGE },
        shading: { fill: "3F51B5" }, // Royal Indigo color
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
        },
      });
    };

    // Table Data Cell helper
    const createDataCell = (text: string, widthPercent: number, bold = false) => {
      return new TableCell({
        children: [
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text,
                bold,
                size: 22,
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
        ],
        width: { size: widthPercent, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
        },
      });
    };

    // Metadata Table (Class, Subject, Duration, Unit)
    const metaTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createHeaderCell("المادة الدراسية", 25),
            createHeaderCell("الصف الدراسي", 25),
            createHeaderCell("زمن الحصة", 25),
            createHeaderCell("الوحدة الدراسية", 25),
          ],
        }),
        new TableRow({
          children: [
            createDataCell(params.subject, 25),
            createDataCell(params.grade, 25),
            createDataCell(params.duration || "45 دقيقة", 25),
            createDataCell(params.unit || "غير محدد", 25),
          ],
        }),
      ],
    });

    const docChildren: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];

    // Title Paragraph
    docChildren.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({
            text: `تحضير درس: ${params.title}`,
            bold: true,
            color: "3F51B5",
            size: 36,
            font: "Calibri",
            rightToLeft,
          }),
        ],
      }),
      new Paragraph({ text: "" }), // spacing
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "تم التوليد بنجاح عبر منصة ورقة للتحضير الذكي للدروس",
            size: 18,
            color: "666666",
            font: "Calibri",
            rightToLeft,
          }),
        ],
      }),
      new Paragraph({ text: "" }), // spacing
      metaTable,
      new Paragraph({ text: "" }), // spacing
    );

    // Section Creator Helper
    const addSection = (title: string, bulletGroups: { name: string; items: string[] }[]) => {
      docChildren.push(
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: `■ ${title}`,
              bold: true,
              color: "1A237E",
              size: 26,
              font: "Calibri",
              rightToLeft,
            }),
          ],
        }),
        new Paragraph({ text: "" }),
      );

      for (const group of bulletGroups) {
        if (group.name) {
          docChildren.push(
            new Paragraph({
              bidirectional: true,
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: `${group.name}:`,
                  bold: true,
                  color: "333333",
                  size: 22,
                  font: "Calibri",
                  rightToLeft,
                }),
              ],
            }),
          );
        }

        for (const item of group.items) {
          docChildren.push(
            new Paragraph({
              bidirectional: true,
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: `  • ${item}`,
                  size: 22,
                  font: "Calibri",
                  rightToLeft,
                }),
              ],
            }),
          );
        }
        docChildren.push(new Paragraph({ text: "" }));
      }
    };

    // 1. Objectives Section
    addSection("الأهداف السلوكية للدرس", [
      { name: "الأهداف المعرفية", items: params.data.behavioralObjectives.cognitive },
      { name: "الأهداف الوجدانية والتربوية", items: params.data.behavioralObjectives.affective },
      { name: "الأهداف المهارية والعملية", items: params.data.behavioralObjectives.psychomotor },
    ]);

    // 2. Strategies Section
    addSection("إستراتيجيات التدريس والوسائل الرقمية", [
      {
        name: "إستراتيجيات التدريس المستخدمة",
        items: params.data.strategiesAndDigitalSkills.strategies,
      },
      {
        name: "المهارات الرقمية والأدوات التقنية",
        items: params.data.strategiesAndDigitalSkills.digitalSkills,
      },
    ]);

    // 3. Lesson Scenario
    docChildren.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun({
            text: "■ سيناريو الحصة وخطة الشرح",
            bold: true,
            color: "1A237E",
            size: 26,
            font: "Calibri",
            rightToLeft,
          }),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: "التمهيد والتهيئة الحافزة:",
            bold: true,
            size: 22,
            rightToLeft,
          }),
        ],
      }),
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: params.data.lessonScenario.introduction,
            size: 22,
            rightToLeft,
          }),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: "خطوات عرض المفهوم والسيناريو الشرح بالتفصيل:",
            bold: true,
            size: 22,
            rightToLeft,
          }),
        ],
      }),
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: params.data.lessonScenario.deliveryScript,
            size: 22,
            rightToLeft,
          }),
        ],
      }),
      new Paragraph({ text: "" }),
    );

    // Exercises
    addSection("التمارين والأنشطة الصفية المقترحة", [
      { name: "", items: params.data.lessonScenario.exercises },
    ]);

    // 4. Assessment and Homework
    docChildren.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun({
            text: "■ التقويم الختامي والواجبات",
            bold: true,
            color: "1A237E",
            size: 26,
            font: "Calibri",
            rightToLeft,
          }),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: "الواجب المنزلي المقترح:",
            bold: true,
            size: 22,
            rightToLeft,
          }),
        ],
      }),
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: params.data.assessmentAndHomework.homework,
            size: 22,
            rightToLeft,
          }),
        ],
      }),
      new Paragraph({ text: "" }),
    );

    // Summative Assessment
    addSection("أسئلة التقويم الختامي للدرس", [
      { name: "", items: params.data.assessmentAndHomework.summativeAssessment },
    ]);

    const doc = new Document({ sections: [{ children: docChildren }] });
    const blob = await Packer.toBlob(doc);
    const safe =
      (params.filename ?? params.title).replace(/[\\/:*?"<>|]+/g, "").slice(0, 80) || "document";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `تحضير_${safe}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("تم تنزيل التحضير بنجاح!");
  } catch (err) {
    console.error("خطأ أثناء تصدير ملف Word:", err);
    toast.error("حدث خطأ أثناء تصدير ملف Word");
  }
}

export interface StructuredQuizAndAssignmentData {
  title: string;
  mcqs: {
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
  }[];
  trueFalse: {
    question: string;
    correctAnswer: boolean;
    correction: string;
  }[];
  shortAnswer: {
    question: string;
    sampleAnswer: string;
  }[];
  homeworkAssignment: {
    title: string;
    description: string;
    estimatedTime: string;
    evaluationCriteria: string;
  };
}

export async function downloadStructuredQuizAndAssignmentDocx(params: {
  title: string;
  subject: string;
  grade: string;
  difficulty: string;
  data: StructuredQuizAndAssignmentData;
  filename?: string;
}): Promise<void> {
  try {
    const {
      Document,
      Packer,
      Paragraph,
      TextRun,
      Table,
      TableRow,
      TableCell,
      HeadingLevel,
      BorderStyle,
      WidthType,
      AlignmentType,
      PageBreak,
    } = await import("docx");

    const rightToLeft = true;

    // Table Header Cell helper
    const createHeaderCell = (text: string, widthPercent: number) => {
      return new TableCell({
        children: [
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text,
                bold: true,
                color: "FFFFFF",
                size: 24,
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
        ],
        width: { size: widthPercent, type: WidthType.PERCENTAGE },
        shading: { fill: "3F51B5" }, // Royal Indigo color
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
        },
      });
    };

    // Table Data Cell helper
    const createDataCell = (text: string, widthPercent: number, bold = false) => {
      return new TableCell({
        children: [
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text,
                bold,
                size: 22,
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
        ],
        width: { size: widthPercent, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
        },
      });
    };

    // Metadata Table (Class, Subject, Difficulty, Type)
    const metaTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createHeaderCell("المادة الدراسية", 25),
            createHeaderCell("الصف الدراسي", 25),
            createHeaderCell("مستوى الصعوبة", 25),
            createHeaderCell("عدد الأسئلة", 25),
          ],
        }),
        new TableRow({
          children: [
            createDataCell(params.subject, 25),
            createDataCell(params.grade, 25),
            createDataCell(params.difficulty, 25),
            createDataCell(
              String(
                (params.data.mcqs?.length || 0) +
                  (params.data.trueFalse?.length || 0) +
                  (params.data.shortAnswer?.length || 0),
              ) + " أسئلة",
              25,
            ),
          ],
        }),
      ],
    });

    const docChildren: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];

    // Title Paragraph
    docChildren.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({
            text: params.data.title || `اختبار وواجب: ${params.title}`,
            bold: true,
            color: "3F51B5",
            size: 36,
            font: "Calibri",
            rightToLeft,
          }),
        ],
      }),
      new Paragraph({ text: "" }), // spacing
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "تم التوليد بنجاح عبر منصة ورقة للتحضير والتقويم الذكي",
            size: 18,
            color: "666666",
            font: "Calibri",
            rightToLeft,
          }),
        ],
      }),
      new Paragraph({ text: "" }), // spacing
      metaTable,
      new Paragraph({ text: "" }), // spacing
    );

    // HELPER: Write Student Version of Questions
    const addStudentCopy = () => {
      docChildren.push(
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "--- الجزء الأول: نسخة الطالب (للطباعة والتوزيع) ---",
              bold: true,
              color: "2E7D32",
              size: 26,
              font: "Calibri",
              rightToLeft,
            }),
          ],
        }),
        new Paragraph({ text: "" }),
      );

      // Student MCQs
      if (params.data.mcqs && params.data.mcqs.length > 0) {
        docChildren.push(
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: "أولاً: أسئلة الاختيار من متعدد",
                bold: true,
                color: "1A237E",
                size: 24,
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
        );

        params.data.mcqs.forEach((item, index) => {
          docChildren.push(
            new Paragraph({
              bidirectional: true,
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: `س ${index + 1}: ${item.question}`,
                  bold: true,
                  size: 22,
                  font: "Calibri",
                  rightToLeft,
                }),
              ],
            }),
          );

          // Add choices
          item.options.forEach((opt, oIdx) => {
            const letter = ["أ", "ب", "ج", "د"][oIdx] || "-";
            docChildren.push(
              new Paragraph({
                bidirectional: true,
                alignment: AlignmentType.RIGHT,
                indent: { right: 288 },
                children: [
                  new TextRun({
                    text: `[  ]  ${letter}) ${opt}`,
                    size: 20,
                    font: "Calibri",
                    rightToLeft,
                  }),
                ],
              }),
            );
          });
          docChildren.push(new Paragraph({ text: "" }));
        });
      }

      // Student True/False
      if (params.data.trueFalse && params.data.trueFalse.length > 0) {
        docChildren.push(
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: "ثانياً: أسئلة صواب أم خطأ",
                bold: true,
                color: "1A237E",
                size: 24,
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
        );

        params.data.trueFalse.forEach((item, index) => {
          docChildren.push(
            new Paragraph({
              bidirectional: true,
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: `س ${index + 1}: ${item.question}   (   صواب   /   خطأ   )`,
                  size: 22,
                  font: "Calibri",
                  rightToLeft,
                }),
              ],
            }),
            new Paragraph({ text: "" }),
          );
        });
      }

      // Student Short Answer
      if (params.data.shortAnswer && params.data.shortAnswer.length > 0) {
        docChildren.push(
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: "ثالثاً: الأسئلة المقالية القصيرة",
                bold: true,
                color: "1A237E",
                size: 24,
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
        );

        params.data.shortAnswer.forEach((item, index) => {
          docChildren.push(
            new Paragraph({
              bidirectional: true,
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: `س ${index + 1}: ${item.question}`,
                  bold: true,
                  size: 22,
                  font: "Calibri",
                  rightToLeft,
                }),
              ],
            }),
            new Paragraph({
              bidirectional: true,
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: "الإجابة: __________________________________________________________________________",
                  color: "888888",
                  size: 18,
                  font: "Calibri",
                  rightToLeft,
                }),
              ],
            }),
            new Paragraph({ text: "" }),
          );
        });
      }

      // Student Homework
      if (params.data.homeworkAssignment) {
        docChildren.push(
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: `رابعاً: الواجب المنزلي التطبيقي (${params.data.homeworkAssignment.title})`,
                bold: true,
                color: "1A237E",
                size: 24,
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: params.data.homeworkAssignment.description,
                size: 20,
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: `الزمن المتوقع للإنجاز: ${params.data.homeworkAssignment.estimatedTime}`,
                size: 18,
                color: "E65100",
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
        );
      }
    };

    // HELPER: Write Teacher Version with Answers
    const addTeacherCopy = () => {
      docChildren.push(
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "--- الجزء الثاني: دليل تصحيح المعلم (نموذج الإجابة الرسمي) ---",
              bold: true,
              color: "C62828",
              size: 26,
              font: "Calibri",
              rightToLeft,
            }),
          ],
        }),
        new Paragraph({ text: "" }),
      );

      // Teacher MCQs
      if (params.data.mcqs && params.data.mcqs.length > 0) {
        docChildren.push(
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: "أولاً: إجابات الاختيار من متعدد",
                bold: true,
                color: "C62828",
                size: 24,
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
        );

        params.data.mcqs.forEach((item, index) => {
          docChildren.push(
            new Paragraph({
              bidirectional: true,
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: `س ${index + 1}: ${item.question}`,
                  bold: true,
                  size: 22,
                  font: "Calibri",
                  rightToLeft,
                }),
              ],
            }),
          );

          item.options.forEach((opt, oIdx) => {
            const letter = ["أ", "ب", "ج", "د"][oIdx] || "-";
            const isCorrect = opt === item.correctAnswer;
            docChildren.push(
              new Paragraph({
                bidirectional: true,
                alignment: AlignmentType.RIGHT,
                indent: { right: 288 },
                children: [
                  new TextRun({
                    text: `${isCorrect ? "✓ [الإجابة الصحيحة]" : "[   ]"}  ${letter}) ${opt}`,
                    bold: isCorrect,
                    color: isCorrect ? "2E7D32" : "333333",
                    size: 20,
                    font: "Calibri",
                    rightToLeft,
                  }),
                ],
              }),
            );
          });

          docChildren.push(
            new Paragraph({
              bidirectional: true,
              alignment: AlignmentType.RIGHT,
              indent: { right: 288 },
              children: [
                new TextRun({
                  text: `التفسير العلمي والتربوي: ${item.explanation}`,
                  color: "555555",
                  size: 18,
                  font: "Calibri",
                  rightToLeft,
                }),
              ],
            }),
            new Paragraph({ text: "" }),
          );
        });
      }

      // Teacher True/False
      if (params.data.trueFalse && params.data.trueFalse.length > 0) {
        docChildren.push(
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: "ثانياً: إجابات صواب أم خطأ",
                bold: true,
                color: "C62828",
                size: 24,
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
        );

        params.data.trueFalse.forEach((item, index) => {
          docChildren.push(
            new Paragraph({
              bidirectional: true,
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: `س ${index + 1}: ${item.question}`,
                  size: 22,
                  font: "Calibri",
                  rightToLeft,
                }),
              ],
            }),
            new Paragraph({
              bidirectional: true,
              alignment: AlignmentType.RIGHT,
              indent: { right: 288 },
              children: [
                new TextRun({
                  text: `الإجابة الصحيحة: ${item.correctAnswer ? "صواب (صح)" : "خطأ (خطأ)"}`,
                  bold: true,
                  color: item.correctAnswer ? "2E7D32" : "C62828",
                  size: 20,
                  font: "Calibri",
                  rightToLeft,
                }),
              ],
            }),
            new Paragraph({
              bidirectional: true,
              alignment: AlignmentType.RIGHT,
              indent: { right: 288 },
              children: [
                new TextRun({
                  text: `التصحيح/الشرح: ${item.correction}`,
                  color: "555555",
                  size: 18,
                  font: "Calibri",
                  rightToLeft,
                }),
              ],
            }),
            new Paragraph({ text: "" }),
          );
        });
      }

      // Teacher Short Answer
      if (params.data.shortAnswer && params.data.shortAnswer.length > 0) {
        docChildren.push(
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: "ثالثاً: نماذج إجابة الأسئلة المقالية القصيرة",
                bold: true,
                color: "C62828",
                size: 24,
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
        );

        params.data.shortAnswer.forEach((item, index) => {
          docChildren.push(
            new Paragraph({
              bidirectional: true,
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: `س ${index + 1}: ${item.question}`,
                  bold: true,
                  size: 22,
                  font: "Calibri",
                  rightToLeft,
                }),
              ],
            }),
            new Paragraph({
              bidirectional: true,
              alignment: AlignmentType.RIGHT,
              indent: { right: 288 },
              children: [
                new TextRun({
                  text: `نموذج الإجابة المقترح: ${item.sampleAnswer}`,
                  bold: true,
                  color: "1565C0",
                  size: 20,
                  font: "Calibri",
                  rightToLeft,
                }),
              ],
            }),
            new Paragraph({ text: "" }),
          );
        });
      }

      // Teacher Homework Evaluation
      if (params.data.homeworkAssignment) {
        docChildren.push(
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: `رابعاً: دليل تقييم الواجب التطبيقي (${params.data.homeworkAssignment.title})`,
                bold: true,
                color: "C62828",
                size: 24,
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: `وصف الواجب: ${params.data.homeworkAssignment.description}`,
                size: 20,
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: `معايير التقييم المقترحة للمعلم: ${params.data.homeworkAssignment.evaluationCriteria}`,
                color: "2E7D32",
                size: 20,
                font: "Calibri",
                rightToLeft,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
        );
      }
    };

    // 1. Build Student copy
    addStudentCopy();

    // 2. Add page break
    docChildren.push(new Paragraph({ children: [new PageBreak()] }));

    // 3. Build Teacher copy
    addTeacherCopy();

    const doc = new Document({ sections: [{ children: docChildren }] });
    const blob = await Packer.toBlob(doc);
    const safe =
      (params.filename ?? params.title).replace(/[\\/:*?"<>|]+/g, "").slice(0, 80) || "document";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `اختبار_واجب_${safe}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير ملف الاختبار والواجب بنجاح!");
  } catch (err) {
    console.error("خطأ أثناء تصدير ملف Word للتقييم:", err);
    toast.error("حدث خطأ أثناء تصدير ملف Word");
  }
}

export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("تم النسخ إلى الحافظة");
  } catch {
    toast.error("تعذر النسخ");
  }
}
