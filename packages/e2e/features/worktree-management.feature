Feature: Worktree Management
  As a user working on a repository
  I want to view and manage git worktrees
  So that I can work on multiple branches simultaneously

  Background:
    Given the app has repos configured:
      | name          | branch |
      | project-alpha | main   |
    And the dock layout is visible
    And "project-alpha" is the active repo

  Scenario: Worktrees tab shows worktree view
    When I click the "Worktrees" tab
    Then I should see the worktrees view
