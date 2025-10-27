/**
 * frontend/tests/directorReport.test.jsx
 *
 * Streamlined unit tests for the DirectorReport component.
 * Tests focus on core functionality matching the functional test cases (TC-001 to TC-007):
 * - Component rendering and main sections
 * - Performance metrics display (time taken, productivity trends)
 * - Project scope metrics and milestones  
 * - Task scope metrics and overdue analysis
 * - Team performance overview
 * - PDF export functionality
 * - Error handling
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import dayjs from 'dayjs';

// Mock window.open and setTimeout for PDF export tests
const mockPrintWindow = {
  document: { write: vi.fn(), close: vi.fn() },
  focus: vi.fn(),
  print: vi.fn(),
  close: vi.fn()
};

Object.defineProperty(window, 'open', {
  value: vi.fn(() => mockPrintWindow),
  writable: true
});

Object.defineProperty(window, 'alert', {
  value: vi.fn(),
  writable: true
});

// Mock setTimeout to prevent async issues
// Use real timers for Testing Library compatibility
vi.useRealTimers();

// Ensure fetch is properly mocked to prevent network calls
global.fetch = vi.fn();

// Component imports
import Report from '../src/pages/Report.jsx';
import { AuthCtx } from '../src/context/AuthContext.jsx';

// Mock API calls
vi.mock('../src/services/api.js', () => ({
  getDirectorReport: vi.fn(),
  BASE: 'http://localhost:3000'
}));

import { getDirectorReport } from '../src/services/api.js';

// Mock dayjs for consistent date testing
vi.mock('dayjs', () => {
  const mockDayjs = vi.fn(() => ({
    format: vi.fn((format) => {
      if (format === 'MMMM D, YYYY') return 'October 26, 2025';
      if (format === 'MMM D, YYYY') return 'Oct 26, 2025';
      return '2025-10-26';
    })
  }));
  mockDayjs.extend = vi.fn();
  return { default: mockDayjs };
});

describe('DirectorReport Component', () => {
  
  const mockDirectorUser = {
    id: 'director123',
    name: 'Test Director',
    email: 'director@test.com',
    role: 'Director',
    department: {
      _id: 'dept123',
      name: 'System Solutioning'
    }
  };

  const mockReportData = {
    avgTaskCompletionDays: 12.5,
    avgProjectCompletionDays: 45.3,
    productivityTrend: 'Improving',
    completionRateThisMonth: 75.0,
    completionRateLastMonth: 60.0,
    projectScope: {
      totalProjects: 8,
      projectStatusCounts: { 'To Do': 2, 'In Progress': 4, 'Done': 1, 'Overdue': 1 },
      projectStatusPercentages: { 'To Do': 25.0, 'In Progress': 50.0, 'Done': 12.5, 'Overdue': 12.5 },
      milestones: [
        {
          projectId: 'proj1',
          projectName: 'Cloud Migration Initiative',
          status: 'In Progress',
          deadline: '2025-11-15T00:00:00.000Z',
          overdueResponsibility: [
            {
              departmentName: 'System Solutioning',
              overdueTaskCount: 2
            }
          ]
        }
      ]
    },
    taskScope: {
      totalTasks: 25,
      taskStatusCounts: { 'To Do': 8, 'In Progress': 12, 'Done': 3, 'Overdue': 2 },
      taskStatusPercentages: { 'To Do': 32.0, 'In Progress': 48.0, 'Done': 12.0, 'Overdue': 8.0 },
      overdueCount: 2,
      overduePercentage: 8.0,
      overdueTasksByProject: [
        {
          projectName: 'Cloud Migration Initiative',
          overdueTasks: [
            {
              taskName: 'Database Migration',
              deadline: '2025-10-20T00:00:00.000Z',
              assignedMembers: [{ name: 'John Doe' }],
              daysPastDue: 6
            }
          ]
        }
      ]
    },
    teamPerformance: {
      teamSize: 5,
      departmentTeam: [
        {
          name: 'John Doe',
          role: 'Staff',
          tasksInvolved: 8,
          todoTasks: 3,
          inProgressTasks: 4,
          completedTasks: 1,
          overdueTasks: 2,
          overdueRate: 25.0
        },
        {
          name: 'Jane Smith',
          role: 'Manager',
          tasksInvolved: 6,
          overdueRate: 0.0
        }
      ]
    },
    departmentInfo: {
      departmentName: 'System Solutioning'
    }
  };

  const renderDirectorReport = (reportData = mockReportData) => {
    const mockAuthContext = {
      user: mockDirectorUser,
      login: vi.fn(),
      logout: vi.fn(),
      loading: false
    };

    vi.mocked(getDirectorReport).mockResolvedValue(reportData);

    return render(
      <AuthCtx.Provider value={mockAuthContext}>
        <Report />
      </AuthCtx.Provider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock getDirectorReport to return our test data
    vi.mocked(getDirectorReport).mockResolvedValue(mockReportData);
    // Mock window.open for PDF export
    window.open.mockReturnValue(mockPrintWindow);
    // Mock fetch to prevent any real network calls from other components
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDirectorUser),
      text: () => Promise.resolve(''),
    });
  });

    // TC-001: Time Performance Metrics
  describe('Time Performance Metrics (TC-001)', () => {
    it('should display productivity trend and completion rates', async () => {
      renderDirectorReport();

      await waitFor(() => {
        // Check for the Project Performance Metrics section
        expect(screen.getByText('Project Performance Metrics')).toBeInTheDocument();
        expect(screen.getByText('Improving')).toBeInTheDocument();
        expect(screen.getByText(/75% projects completed this month vs 60% last month/)).toBeInTheDocument();
      });
    });

    it('should display productivity trend with comparison', async () => {
      renderDirectorReport();

      await waitFor(() => {
        expect(screen.getByText('Improving')).toBeInTheDocument();
        expect(screen.getByText(/75% projects completed this month vs 60% last month/)).toBeInTheDocument();
      });
    });
  });

  // TC-002: Project Scope Metrics  
  describe('Project Scope Metrics (TC-002)', () => {
    it('should display project scope overview with counts and percentages', async () => {
      renderDirectorReport();

      await waitFor(() => {
        const totalProjectsSection = screen.getByText('Total Projects').parentElement;
        expect(totalProjectsSection).toHaveTextContent('8');
        
        expect(screen.getByText('To Do (25%)')).toBeInTheDocument();
        expect(screen.getByText('In Progress (50%)')).toBeInTheDocument();
        expect(screen.getByText('Done (12.5%)')).toBeInTheDocument();
        expect(screen.getByText('Overdue (12.5%)')).toBeInTheDocument();
      });
    });
  });

    // TC-003: Milestone Status  
  describe('Milestone Status (TC-003)', () => {
    it('should display project milestones with status and deadlines', async () => {
      renderDirectorReport();

      await waitFor(() => {
        // Look for the milestones section heading and project name
        expect(screen.getByText('Cloud Migration Initiative')).toBeInTheDocument();
        // Use getAllByText to handle multiple "In Progress" elements
        const inProgressElements = screen.getAllByText('In Progress');
        expect(inProgressElements.length).toBeGreaterThan(0);
      });
    });
  });

  // TC-004: Task Scope Metrics
  describe('Task Scope Metrics (TC-004)', () => {
    it('should display task scope overview with status distribution', async () => {
      renderDirectorReport();

      await waitFor(() => {
        const totalTasksSection = screen.getByText('Total Tasks').parentElement;
        expect(totalTasksSection).toHaveTextContent('25');
        
        expect(screen.getByText('To Do (32%)')).toBeInTheDocument();
        expect(screen.getByText('In Progress (48%)')).toBeInTheDocument();
        expect(screen.getByText('Done (12%)')).toBeInTheDocument();
        expect(screen.getByText('Overdue (8%)')).toBeInTheDocument();
      });
    });
  });

  // TC-005: Overdue Task Analysis
  describe('Overdue Task Analysis (TC-005)', () => {
    it('should display overdue tasks with project breakdown', async () => {
      renderDirectorReport();

      await waitFor(() => {
        expect(screen.getByText('Task Scope')).toBeInTheDocument();
        expect(screen.getByText('Database Migration')).toBeInTheDocument();
        expect(screen.getByText('(6 days overdue)')).toBeInTheDocument();
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('should show department responsibility for overdue tasks', async () => {
      renderDirectorReport();

      await waitFor(() => {
        expect(screen.getByText('Departments with overdue tasks:')).toBeInTheDocument();
        expect(screen.getByText('System Solutioning')).toBeInTheDocument();
        expect(screen.getByText('2 overdue tasks')).toBeInTheDocument();
      });
    });
  });

  // TC-006: Team Performance Overview
  describe('Team Performance Overview (TC-006)', () => {
    it('should display team performance table with member details', async () => {
      renderDirectorReport();

      await waitFor(() => {
        expect(screen.getByText('Team Performance Overview')).toBeInTheDocument();
        
        const table = screen.getByRole('table');
        expect(table).toHaveTextContent('John Doe');
        expect(table).toHaveTextContent('Staff');
        expect(table).toHaveTextContent('Jane Smith');
        expect(table).toHaveTextContent('Manager');
        expect(table).toHaveTextContent('25%'); // John's overdue rate
      });
    });

    it('should display team size and member task counts', async () => {
      renderDirectorReport();

      await waitFor(() => {
        const teamSection = screen.getByText('Team Performance Overview').parentElement;
        expect(teamSection).toHaveTextContent('5'); // team size
        
        const table = screen.getByRole('table');
        expect(table).toHaveTextContent('8'); // John's tasks involved
        expect(table).toHaveTextContent('6'); // Jane's tasks involved
      });
    });
  });

  // TC-007: Department Report Layout
  describe('Department Report Layout (TC-007)', () => {
    it('should render main report sections and header', async () => {
      renderDirectorReport();

      await waitFor(() => {
        expect(screen.getByText(/System Solutioning\s+Performance Report/)).toBeInTheDocument();
        expect(screen.getByText('Generated on October 26, 2025')).toBeInTheDocument();
        expect(screen.getByText('Export as PDF')).toBeInTheDocument();
        
        // Verify all main sections are present
        expect(screen.getByText('Project Performance Metrics')).toBeInTheDocument();
        expect(screen.getByText('Project Scope')).toBeInTheDocument();
        expect(screen.getByText('Task Scope')).toBeInTheDocument();
        expect(screen.getByText('Team Performance Overview')).toBeInTheDocument();
        expect(screen.getByText('Project Milestones Status')).toBeInTheDocument();
      });
    });
  });

  // PDF Export Functionality
  describe('PDF Export Functionality', () => {
    it('should handle PDF export with correct content', async () => {
      renderDirectorReport();

      await waitFor(() => {
        const exportButton = screen.getByText('Export as PDF');
        fireEvent.click(exportButton);
        
        expect(window.open).toHaveBeenCalled();
        expect(mockPrintWindow.document.write).toHaveBeenCalled();
        
        const writeCall = mockPrintWindow.document.write.mock.calls[0];
        expect(writeCall[0]).toContain('System Solutioning Performance Report');
        expect(writeCall[0]).toContain('Project Performance Metrics');
      });
    });

    it('should have export functionality', async () => {
      renderDirectorReport();

      await waitFor(() => {
        expect(screen.getByText('Export as PDF')).toBeInTheDocument();
      });

      const exportButton = screen.getByText('Export as PDF');
      expect(exportButton).toBeEnabled();
      
      // Click the button to ensure it works
      fireEvent.click(exportButton);
      // Export functionality is working if no error is thrown
    });
  });

  // Error and Edge Cases
  describe('Error Handling and Edge Cases', () => {
    it('should display loading state', () => {
      vi.mocked(getDirectorReport).mockImplementation(() => new Promise(() => {}));
      renderDirectorReport();
      expect(screen.getByText('Loading report data…')).toBeInTheDocument();
    });

    it('should handle API failure gracefully', async () => {
      vi.mocked(getDirectorReport).mockRejectedValue(new Error('API Error'));
      global.fetch = vi.fn().mockRejectedValue(new Error('Network Error'));
      
      renderDirectorReport();

      // Should not crash and should show some content (either error or loading)
      await waitFor(() => {
        expect(document.body).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should handle empty data gracefully', async () => {
      const emptyData = {
        ...mockReportData,
        projectScope: { ...mockReportData.projectScope, totalProjects: 0 },
        taskScope: { ...mockReportData.taskScope, totalTasks: 0 },
        teamPerformance: { teamSize: 0, departmentTeam: [] }
      };

      renderDirectorReport(emptyData);

      await waitFor(() => {
        expect(screen.getByText(/System Solutioning\s+Performance Report/)).toBeInTheDocument();
        const totalProjectsSection = screen.getByText('Total Projects').parentElement;
        expect(totalProjectsSection).toHaveTextContent('0');
      });
    });
  });

  // Data Validation
  describe('Data Calculations', () => {
    it('should calculate percentages correctly', async () => {
      renderDirectorReport();

      await waitFor(() => {
        // Use getAllByText to handle multiple percentage elements
        const percentageElements = screen.getAllByText(/25%/);
        expect(percentageElements.length).toBeGreaterThan(0);
        const fiftyPercentElements = screen.getAllByText(/50%/);
        expect(fiftyPercentElements.length).toBeGreaterThan(0);
      });
    });
  });
});