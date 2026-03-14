import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { CombinedClassGroup, WEEKDAYS, Student } from './types';

/**
 * Standard cell styling: thin borders, middle/center alignment, wrap text.
 */
const applyDefaultStyle = (cell: ExcelJS.Cell) => {
  cell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };
  cell.alignment = {
    vertical: 'middle',
    horizontal: 'center',
    wrapText: true,
  };
};

/**
 * Sorts students by className first, then by id.
 */
const sortStudents = (students: Student[]) => {
  return [...students].sort((a, b) => {
    const classCmp = a.className.localeCompare(b.className);
    if (classCmp !== 0) return classCmp;
    return a.id.localeCompare(b.id);
  });
};

export const exportFullWorkbook = async (groups: CombinedClassGroup[], totalLabs: number = 10) => {
  const workbook = new ExcelJS.Workbook();
  const totalCols = 5 + totalLabs;

  // ==========================================================================
  // Sheet 1: 教师教室表 (排课矩阵)
  // ==========================================================================
  const sheet1 = workbook.addWorksheet('教师教室表');
  sheet1.mergeCells(1, 1, 1, totalCols);
  const s1Title = sheet1.getCell('A1');
  s1Title.value = '实验课教师教室安排表';
  s1Title.font = { size: 14, bold: true };
  applyDefaultStyle(s1Title);

  const s1Headers = ['上课周数', '星期', '节次', '学科', '班级'];
  for (let i = totalLabs; i >= 1; i--) s1Headers.push(`实验室${i}`);
  const s1HeaderRow = sheet1.addRow(s1Headers);
  s1HeaderRow.eachCell((cell) => {
    cell.font = { bold: true };
    applyDefaultStyle(cell);
  });

  let lastWeekday = '';
  let mergeStartRow = 3;

  const sortedGroups = [...groups].sort((a, b) => a.time.weekday - b.time.weekday);

  sortedGroups.forEach((group, index) => {
    const currentWeekday = WEEKDAYS[group.time.weekday - 1];
    
    // Format: Class1,Class2 Count1+Count2=Total
    const countsByClass: { [key: string]: number } = {};
    group.students.forEach(s => {
      countsByClass[s.className] = (countsByClass[s.className] || 0) + 1;
    });
    const countsStr = group.classNames.map(name => countsByClass[name] || 0).join('+');
    const classInfo = `${group.classNames.join(',')} ${countsStr}=${group.totalStudents}人`;
    
    const rowData = [
      `${group.time.startWeek}-${group.time.endWeek}周`,
      currentWeekday,
      `${group.time.session}${group.time.period}`,
      group.courseName,
      classInfo
    ];

    for (let i = totalLabs; i >= 1; i--) {
      const labName = `实验室${i}`;
      const assignment = group.assignments.find(a => a.labName === labName);
      rowData.push(assignment ? assignment.teacherName : '');
    }

    const row = sheet1.addRow(rowData);
    row.eachCell(cell => applyDefaultStyle(cell));

    // Vertical merge for Weekday
    if (index > 0 && currentWeekday !== lastWeekday) {
      if (mergeStartRow < row.number - 1) {
        sheet1.mergeCells(mergeStartRow, 2, row.number - 1, 2);
      }
      mergeStartRow = row.number;
    }
    if (index === sortedGroups.length - 1) {
      if (mergeStartRow < row.number) {
        sheet1.mergeCells(mergeStartRow, 2, row.number, 2);
      }
    }
    lastWeekday = currentWeekday;
  });

  sheet1.getColumn(1).width = 12;
  sheet1.getColumn(4).width = 20;
  sheet1.getColumn(5).width = 35;
  for (let i = 6; i <= 5 + totalLabs; i++) sheet1.getColumn(i).width = 12;


  // ==========================================================================
  // Sheet 2: 教室安排表 (号段表)
  // ==========================================================================
  const sheet2 = workbook.addWorksheet('教室安排表');
  let s2CurrentRow = 1;

  groups.forEach(group => {
    sheet2.mergeCells(`A${s2CurrentRow}:B${s2CurrentRow}`);
    const bHeader1 = sheet2.getCell(`A${s2CurrentRow}`);
    bHeader1.value = `${group.classNames.join(',')} ${group.courseName} 教室安排`;
    bHeader1.font = { bold: true };
    applyDefaultStyle(bHeader1);
    bHeader1.alignment = { horizontal: 'left', vertical: 'middle' };
    s2CurrentRow++;

    sheet2.mergeCells(`A${s2CurrentRow}:B${s2CurrentRow}`);
    const bHeader2 = sheet2.getCell(`A${s2CurrentRow}`);
    bHeader2.value = `上课时间：${group.time.startWeek}-${group.time.endWeek}周 ${WEEKDAYS[group.time.weekday - 1]} ${group.time.session}${group.time.period}`;
    applyDefaultStyle(bHeader2);
    bHeader2.alignment = { horizontal: 'left', vertical: 'middle' };
    s2CurrentRow++;

    const bHeader3_1 = sheet2.getCell(`A${s2CurrentRow}`);
    const bHeader3_2 = sheet2.getCell(`B${s2CurrentRow}`);
    bHeader3_1.value = '室号';
    bHeader3_2.value = '号数';
    bHeader3_1.font = { bold: true };
    bHeader3_2.font = { bold: true };
    applyDefaultStyle(bHeader3_1);
    applyDefaultStyle(bHeader3_2);
    s2CurrentRow++;

    group.assignments.forEach((assign, idx) => {
      const row = sheet2.getRow(s2CurrentRow);
      const labCell = row.getCell(1);
      const rangeCell = row.getCell(2);
      
      labCell.value = assign.labName;
      
      // Ensure students are sorted by class then ID
      const sortedInLab = sortStudents(assign.studentRange.studentList);
      
      const studentsByClass: { [key: string]: Student[] } = {};
      sortedInLab.forEach(s => {
        if (!studentsByClass[s.className]) studentsByClass[s.className] = [];
        studentsByClass[s.className].push(s);
      });

      const rangeTexts = Object.entries(studentsByClass).map(([className, list], classIdx, classArr) => {
        const start = list[0].id;
        const end = list[list.length - 1].id;
        
        const isLastLab = idx === group.assignments.length - 1;
        const isLastClassInLab = classIdx === classArr.length - 1;
        const useLastOne = isLastLab && isLastClassInLab;
        
        return `${className}：${start}——${useLastOne ? '最后一位' : end}`;
      });

      rangeCell.value = rangeTexts.join('\n');
      applyDefaultStyle(labCell);
      applyDefaultStyle(rangeCell);
      s2CurrentRow++;
    });

    s2CurrentRow += 2; // Spacer
  });
  sheet2.getColumn(1).width = 15;
  sheet2.getColumn(2).width = 50;


  // ==========================================================================
  // Dynamic Sheets: [Course Name]成绩表 & [Course Name]座位安排表
  // ==========================================================================
  const uniqueCourseNames = Array.from(new Set(groups.map(g => g.courseName)));

  uniqueCourseNames.forEach(courseName => {
    const courseGroups = groups.filter(g => g.courseName === courseName);

    // --- Dynamic Sheet A: [Course Name]成绩表 ---
    const gradeSheet = workbook.addWorksheet(`${courseName}成绩表`);
    let gRow = 1;

    courseGroups.forEach(group => {
      group.assignments.forEach(assign => {
        // Row 1: Title (合并 14 列)
        gradeSheet.mergeCells(gRow, 1, gRow, 14);
        const h1 = gradeSheet.getCell(gRow, 1);
        h1.value = `${group.courseName} ${assign.labName} 成绩单`;
        h1.font = { bold: true, size: 12 };
        applyDefaultStyle(h1);
        h1.alignment = { horizontal: 'left', vertical: 'middle' };
        gRow++;

        // Row 2 & 3: 复杂表头
        const h2Row = gradeSheet.getRow(gRow);
        const h3Row = gradeSheet.getRow(gRow + 1);

        // 纵向合并：序号, 学号, 姓名
        ['序号', '学号', '姓名'].forEach((text, i) => {
          h2Row.getCell(i + 1).value = text;
          applyDefaultStyle(h2Row.getCell(i + 1));
          applyDefaultStyle(h3Row.getCell(i + 1));
          gradeSheet.mergeCells(gRow, i + 1, gRow + 1, i + 1);
        });

        // 横向合并：成绩 (跨 9 列: 第 4 到 第 12 列)
        gradeSheet.mergeCells(gRow, 4, gRow, 12);
        const scoreCell = h2Row.getCell(4);
        scoreCell.value = '成绩';
        applyDefaultStyle(scoreCell);

        // 成绩子表头：1 到 9 整数
        for(let i = 1; i <= 9; i++) {
          const cell = h3Row.getCell(i + 3);
          cell.value = i.toString();
          applyDefaultStyle(cell);
          applyDefaultStyle(h2Row.getCell(i + 3)); // 补充上方合并单元格的边框
        }

        // 纵向合并：班级 (第 13 列)
        h2Row.getCell(13).value = '班级';
        applyDefaultStyle(h2Row.getCell(13));
        applyDefaultStyle(h3Row.getCell(13));
        gradeSheet.mergeCells(gRow, 13, gRow + 1, 13);

        // 纵向合并：备注 (第 14 列)
        h2Row.getCell(14).value = '备注';
        applyDefaultStyle(h2Row.getCell(14));
        applyDefaultStyle(h3Row.getCell(14));
        gradeSheet.mergeCells(gRow, 14, gRow + 1, 14);

        gRow += 2;

        // Data Rows (严格按班级+学号排序)
        const sortedStudents = sortStudents(assign.studentRange.studentList);
        sortedStudents.forEach((student, idx) => {
          const rowData = [
            idx + 1, 
            student.id, 
            student.name, 
            '', '', '', '', '', '', '', '', '', // 9个空的成绩列
            student.className, // 填入真实的班级名称
            '' // 最后的空备注
          ];
          const row = gradeSheet.addRow(rowData);
          row.eachCell(cell => applyDefaultStyle(cell));
          gRow++;
        });

        // Footer (合并 14 列)
        gradeSheet.mergeCells(gRow, 1, gRow, 14);
        const footer = gradeSheet.getCell(gRow, 1);
        footer.value = `上课时间：${group.time.startWeek}-${group.time.endWeek}周 ${WEEKDAYS[group.time.weekday - 1]} ${group.time.session} ${group.time.period}   带教教师：${assign.teacherName}`;
        applyDefaultStyle(footer);
        footer.alignment = { horizontal: 'left', vertical: 'middle' };
        gRow += 4; // 留 3 行空白作为间隔
      });
    });

    // 设置列宽
    gradeSheet.getColumn(2).width = 15; // 学号
    gradeSheet.getColumn(3).width = 12; // 姓名
    gradeSheet.getColumn(13).width = 20; // 班级
    gradeSheet.getColumn(14).width = 15; // 备注
    for(let i = 4; i <= 12; i++) gradeSheet.getColumn(i).width = 5; // 成绩列调窄

    // --- Dynamic Sheet B: [Course Name]座位安排表 ---
    const seatSheet = workbook.addWorksheet(`${courseName}座位安排表`);
    let sRow = 1;

    courseGroups.forEach(group => {
      group.assignments.forEach(assign => {
        // Header 1
        seatSheet.mergeCells(`A${sRow}:K${sRow}`);
        const h1 = seatSheet.getCell(`A${sRow}`);
        h1.value = `${group.classNames.join(',')} ${assign.labName}`;
        applyDefaultStyle(h1);
        sRow++;

        // Header 2: Podium
        seatSheet.mergeCells(`A${sRow}:K${sRow}`);
        const h2 = seatSheet.getCell(`A${sRow}`);
        h2.value = '讲台';
        h2.font = { bold: true, size: 14 };
        applyDefaultStyle(h2);
        sRow++;

        // Header 3: Columns
        const h3Row = seatSheet.getRow(sRow);
        for (let i = 0; i < 4; i++) {
          const idCell = h3Row.getCell(i * 3 + 1);
          const nameCell = h3Row.getCell(i * 3 + 2);
          idCell.value = '学号';
          nameCell.value = '姓名';
          applyDefaultStyle(idCell);
          applyDefaultStyle(nameCell);
          if (i < 3) {
            const spacerCell = h3Row.getCell(i * 3 + 3);
            spacerCell.value = '';
            applyDefaultStyle(spacerCell);
            seatSheet.getColumn(i * 3 + 3).width = 2;
          }
        }
        sRow++;

        // Seating Algorithm
        const students = sortStudents(assign.studentRange.studentList);
        const rows = Math.ceil(students.length / 4);
        const col1 = students.slice(0, rows);
        const col2 = students.slice(rows, rows * 2);
        const col3 = students.slice(rows * 2, rows * 3);
        const col4 = students.slice(rows * 3);

        const maxRows = Math.max(8, rows);

        for (let r = 0; r < maxRows; r++) {
          const rowData = new Array(11).fill('');
          if (col1[r]) { rowData[0] = col1[r].id; rowData[1] = col1[r].name; }
          if (col2[r]) { rowData[3] = col2[r].id; rowData[4] = col2[r].name; }
          if (col3[r]) { rowData[6] = col3[r].id; rowData[7] = col3[r].name; }
          if (col4[r]) { rowData[9] = col4[r].id; rowData[10] = col4[r].name; }
          
          const row = seatSheet.addRow(rowData);
          row.eachCell((cell, colNumber) => {
            if (colNumber !== 3 && colNumber !== 6 && colNumber !== 9) {
               applyDefaultStyle(cell);
            } else {
               cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
            }
          });
          sRow++;
        }

        sRow += 4; // Spacer
      });
    });
    seatSheet.columns.forEach((col, i) => {
      const colIdx = i + 1;
      if ([3, 6, 9].includes(colIdx)) col.width = 2;
      else col.width = 12;
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `实验室排课方案_${new Date().toLocaleDateString()}.xlsx`);
};
