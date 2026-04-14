Feature: Tab Navigation
  As a user with an active repository
  I want to navigate between Specs, Workflow, Worktrees, and AI tabs
  So that I can access different features

  Background:
    Given the app has repos configured:
      | name          | branch |
      | project-alpha | main   |
    And the dock layout is visible
    And "project-alpha" is the active repo

  Scenario: Default tab is Specs
    Then the "Specs" tab should be active

  Scenario Outline: Switching between tabs
    When I click the "<tab>" tab
    Then the "<tab>" tab should be active

    Examples:
      | tab       |
      | Specs     |
      | Workflow  |
      | Worktrees |
      | AI        |
