import { DatabaseSync } from 'node:sqlite';

// 尝试两个可能的数据库位置
let db;
try {
  db = new DatabaseSync('./data/tasks/tasks.db');
  console.log('Using database: ./data/tasks/tasks.db');
} catch (e) {
  try {
    db = new DatabaseSync('./tasks.db');
    console.log('Using database: ./tasks.db');
  } catch (e2) {
    console.error('Cannot open any database file');
    process.exit(1);
  }
}

// 查询被归档的任务
const archivedTaskId = '2cf82359-e35a-4efc-8a89-330fe411e83e-archived-2025-08-12T03-47-27-755Z';
const perfectTaskId = '2cf82359-e35a-4efc-8a89-330fe411e83e-archived-2025-08-12T03-47-27-755Z'; // 完美但被错误归档的任务

try {
  const rows = db.prepare(`
    SELECT 
      task_id, 
      json_extract(progress, '$.status') as progress_status,
      current_step,
      step_status,
      finish_reason,
      is_valid_complete,
      last_step_completed_at,
      LENGTH(outputs) as outputs_length
    FROM tasks 
    WHERE task_id LIKE '%2cf82359-e35a-4efc-8a89-330fe411e83e%'
  `).all();

  console.log('Found tasks:', rows.length);
  rows.forEach(row => {
    console.log('\nTask details:');
    console.log(JSON.stringify(row, null, 2));
  });

  if (rows.length > 0) {
    // 获取完美任务的详细信息
    const perfectTaskData = db.prepare(`
      SELECT outputs
      FROM tasks 
      WHERE task_id = ?
    `).get(perfectTaskId);

    if (perfectTaskData) {
      try {
        const outputs = JSON.parse(perfectTaskData.outputs);
        console.log('\n=== 分析完美任务的详细信息 ===');
        console.log('\nOutputs analysis:');
        console.log('Number of output chunks:', outputs.length);
        
        const finalReportChunks = outputs.filter(output => 
          output.includes('<final-report>') || output.includes('</final-report>')
        );
        
        console.log('Final report chunks found:', finalReportChunks.length);
        
        if (finalReportChunks.length > 0) {
          console.log('\nFinal-report content analysis:');
          finalReportChunks.forEach((chunk, index) => {
            const hasStart = chunk.includes('<final-report>');
            const hasEnd = chunk.includes('</final-report>');
            const length = chunk.length;
            console.log(`Chunk ${index + 1}: length=${length}, hasStart=${hasStart}, hasEnd=${hasEnd}`);
            if (length < 500) {
              console.log(`Content: ${chunk}`);
            } else {
              console.log(`Content preview: ${chunk.substring(0, 200)}...${chunk.slice(-200)}`);
            }
          });
        }
        
        // 检查总内容长度
        const totalContent = outputs.join('');
        const hasCompleteFinalReport = totalContent.includes('<final-report>') && 
                                      totalContent.includes('</final-report>') && 
                                      totalContent.length > 1000;
        
        console.log('\nValidation check:');
        console.log('Total content length:', totalContent.length);
        console.log('Has <final-report>:', totalContent.includes('<final-report>'));
        console.log('Has </final-report>:', totalContent.includes('</final-report>'));
        console.log('Content > 1000 chars:', totalContent.length > 1000);
        console.log('Would pass validation:', hasCompleteFinalReport);
      } catch (e) {
        console.error('Error parsing outputs:', e);
      }
    }
  }

} catch (error) {
  console.error('Database error:', error);
} finally {
  db.close();
}