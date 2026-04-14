Feature: AI Session Creation
  As a user working on a repository
  I want to create AI agent and terminal sessions
  So that I can use Claude or Copilot to assist with coding

  Background:
    Given the app has repos configured:
      | name          | branch |
      | project-alpha | main   |
    And the dock layout is visible
    And "project-alpha" is the active repo

  Scenario: Opening the new session dialog
    When I open the new session dialog
    Then the "New Session" dialog should be visible
    And "AI Agent" should be the default session type

  Scenario: Switching to terminal session type
    When I open the new session dialog
    And I click "Terminal" session type
    Then the provider picker should not be visible

  Scenario: Cancelling the dialog
    When I open the new session dialog
    And I click "Cancel"
    Then the "New Session" dialog should not be visible
